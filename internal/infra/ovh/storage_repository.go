package ovh

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/ovh/go-ovh/ovh"
	"github.com/snigle/photocloud/internal/domain"
)

type StorageRepository struct {
	client    *ovh.Client
	projectID string
	region    string
	bucket    string
	masterKey []byte
}

func NewStorageRepository(client *ovh.Client, projectID string, region string, bucket string, masterKey []byte) *StorageRepository {
	return &StorageRepository{
		client:    client,
		projectID: projectID,
		region:    region,
		bucket:    bucket,
		masterKey: masterKey,
	}
}

type ovhUser struct {
	ID          interface{} `json:"id"`
	Description string      `json:"description"`
}

type ovhS3Credential struct {
	Access string `json:"access"`
	Secret string `json:"secret"`
}

func (r *StorageRepository) GetS3Credentials(ctx context.Context, email string) (*domain.S3Credentials, error) {
	// 1. List users
	var users []ovhUser
	err := r.client.Get(fmt.Sprintf("/cloud/project/%s/user", r.projectID), &users)
	if err != nil {
		return nil, fmt.Errorf("failed to list OVH users: %w", err)
	}

	var userID interface{}
	for _, u := range users {
		if u.Description == email {
			userID = u.ID
			break
		}
	}

	// 2. Create user if not exists
	if userID == nil {
		var newUser ovhUser
		// We use a basic role for object storage.
		// Note: Some API versions might require a separate call for role assignment.
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user", r.projectID), map[string]any{
			"description": email,
			"roles": []string{
				"objectstore_operator",
			},
		}, &newUser)
		if err != nil {
			return nil, fmt.Errorf("failed to create OVH user: %w", err)
		}
		userID = newUser.ID
	}

	// 3. Apply S3 Policy
	if r.bucket != "" {
		policy := map[string]interface{}{
			"Statement": []map[string]interface{}{
				{
					"Effect": "Allow",
					"Action": []string{"s3:ListBucket"},
					"Resource": []string{
						fmt.Sprintf("arn:aws:s3:::%s", r.bucket),
					},
					"Condition": map[string]interface{}{
						"StringLike": map[string]interface{}{
							"s3:prefix": []string{
								fmt.Sprintf("users/%s/", email),
								fmt.Sprintf("users/%s/*", email),
							},
						},
					},
				},
				{
					"Effect": "Allow",
					"Action": []string{"s3:*"},
					"Resource": []string{
						fmt.Sprintf("arn:aws:s3:::%s/users/%s/*", r.bucket, email),
					},
				},
			},
		}
		policyBytes, _ := json.Marshal(policy)
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user/%v/policy", r.projectID, userID), map[string]string{
			"policy": string(policyBytes),
		}, nil)
		if err != nil {
			fmt.Printf("Warning: failed to apply S3 policy to user %v: %v\n", userID, err)
		}
	}

	// 4. Get S3 credentials
	var creds []ovhS3Credential
	err = r.client.Get(fmt.Sprintf("/cloud/project/%s/user/%v/s3Credentials", r.projectID, userID), &creds)
	if err != nil {
		return nil, fmt.Errorf("failed to list S3 credentials: %w", err)
	}

	var s3Cred ovhS3Credential
	if len(creds) == 0 {
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user/%v/s3Credentials", r.projectID, userID), nil, &s3Cred)
		if err != nil {
			return nil, fmt.Errorf("failed to generate S3 credentials: %w", err)
		}
	} else {
		s3Cred = creds[0]
		var secret ovhS3Credential
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user/%v/s3Credentials/%s/secret", r.projectID, userID, s3Cred.Access), nil, &secret)
		s3Cred.Secret = secret.Secret
		if err != nil {
			return nil, fmt.Errorf("failed to get S3 secret: %w", err)
		}
	}

	return &domain.S3Credentials{
		AccessKey: s3Cred.Access,
		SecretKey: s3Cred.Secret,
		Endpoint:  fmt.Sprintf("https://s3.%s.io.cloud.ovh.net", r.region),
		Region:    r.region,
		Bucket:    r.bucket,
	}, nil
}

// UserStorage implementation

type passkeyUserRecord struct {
	Email       string                     `json:"email"`
	Credentials []domain.PasskeyCredential `json:"credentials"`
}

func (r *StorageRepository) getS3ClientForUser(ctx context.Context, email string) (*s3.Client, error) {
	creds, err := r.GetS3Credentials(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("failed to get user credentials: %w", err)
	}

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(creds.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(creds.AccessKey, creds.SecretKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load user S3 config: %w", err)
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(creds.Endpoint)
		o.Region = creds.Region
		o.Credentials = credentials.NewStaticCredentialsProvider(creds.AccessKey, creds.SecretKey, "")
		o.UsePathStyle = true
	}), nil
}

func (r *StorageRepository) GetUser(ctx context.Context, email string) (domain.PasskeyUser, error) {
	s3Client, err := r.getS3ClientForUser(ctx, email)
	if err != nil {
		return nil, err
	}

	key := fmt.Sprintf("users/%s/config/passkeys.json", email)
	algo, sseKey, sseKeyMD5 := r.getSSEParams()
	output, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket:               aws.String(r.bucket),
		Key:                  aws.String(key),
		SSECustomerAlgorithm: aws.String(algo),
		SSECustomerKey:       aws.String(sseKey),
		SSECustomerKeyMD5:    aws.String(sseKeyMD5),
	})
	if err != nil {
		// Fallback for transition: try without SSE-C if it fails
		outputPlain, errPlain := s3Client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(r.bucket),
			Key:    aws.String(key),
		})
		if errPlain == nil {
			defer outputPlain.Body.Close()
			var record passkeyUserRecord
			if err := json.NewDecoder(outputPlain.Body).Decode(&record); err == nil {
				return &domain.PasskeyUserEntity{
					Email:       record.Email,
					Credentials: record.Credentials,
				}, nil
			}
		}
		return nil, fmt.Errorf("failed to get user from S3: %w", err)
	}
	defer output.Body.Close()

	var record passkeyUserRecord
	if err := json.NewDecoder(output.Body).Decode(&record); err != nil {
		return nil, fmt.Errorf("failed to decode user record: %w", err)
	}

	return &domain.PasskeyUserEntity{
		Email:       record.Email,
		Credentials: record.Credentials,
	}, nil
}

func (r *StorageRepository) SaveUser(ctx context.Context, email string, user domain.PasskeyUser) error {
	s3Client, err := r.getS3ClientForUser(ctx, email)
	if err != nil {
		return err
	}

	record := passkeyUserRecord{
		Email:       email,
		Credentials: user.GetCredentials(),
	}

	data, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal user record: %w", err)
	}

	key := fmt.Sprintf("users/%s/config/passkeys.json", email)
	algo, sseKey, sseKeyMD5 := r.getSSEParams()
	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:               aws.String(r.bucket),
		Key:                  aws.String(key),
		Body:                 bytes.NewReader(data),
		SSECustomerAlgorithm: aws.String(algo),
		SSECustomerKey:       aws.String(sseKey),
		SSECustomerKeyMD5:    aws.String(sseKeyMD5),
	})
	if err != nil {
		return fmt.Errorf("failed to save user to S3: %w", err)
	}

	return nil
}

func (r *StorageRepository) GetUserKey(ctx context.Context, email string) ([]byte, error) {
	s3Client, err := r.getS3ClientForUser(ctx, email)
	if err != nil {
		return nil, err
	}

	key := fmt.Sprintf("users/%s/secret.key", email)
	algo, sseKey, sseKeyMD5 := r.getSSEParams()
	output, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket:               aws.String(r.bucket),
		Key:                  aws.String(key),
		SSECustomerAlgorithm: aws.String(algo),
		SSECustomerKey:       aws.String(sseKey),
		SSECustomerKeyMD5:    aws.String(sseKeyMD5),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get user key from S3: %w", err)
	}
	defer output.Body.Close()

	return io.ReadAll(output.Body)
}

func (r *StorageRepository) SaveUserKey(ctx context.Context, email string, userKey []byte) error {
	s3Client, err := r.getS3ClientForUser(ctx, email)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("users/%s/secret.key", email)
	algo, sseKey, sseKeyMD5 := r.getSSEParams()
	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:               aws.String(r.bucket),
		Key:                  aws.String(key),
		Body:                 bytes.NewReader(userKey),
		SSECustomerAlgorithm: aws.String(algo),
		SSECustomerKey:       aws.String(sseKey),
		SSECustomerKeyMD5:    aws.String(sseKeyMD5),
	})
	if err != nil {
		return fmt.Errorf("failed to save user key to S3: %w", err)
	}

	return nil
}

func (r *StorageRepository) getSSEParams() (string, string, string) {
	key := base64.StdEncoding.EncodeToString(r.masterKey)
	hash := md5.Sum(r.masterKey)
	keyMD5 := base64.StdEncoding.EncodeToString(hash[:])
	return "AES256", key, keyMD5
}
