package ovh

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ovh/go-ovh/ovh"
	"github.com/snigle/photocloud/internal/domain"
)

type StorageRepository struct {
	client    *ovh.Client
	projectID string
	region    string
	bucket    string
}

func NewStorageRepository(client *ovh.Client, projectID string, region string, bucket string) *StorageRepository {
	return &StorageRepository{
		client:    client,
		projectID: projectID,
		region:    region,
		bucket:    bucket,
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
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user", r.projectID), map[string]string{
			"description": email,
		}, &newUser)
		if err != nil {
			return nil, fmt.Errorf("failed to create OVH user: %w", err)
		}
		userID = newUser.ID

		// Assign role
		err = r.client.Post(fmt.Sprintf("/cloud/project/%s/user/%v/role", r.projectID, userID), map[string]string{
			"roleName": "objectstore_operator",
		}, nil)
		if err != nil {
			// Some API use roleId instead of roleName, or it might already have a default role.
			// We log but don't fail as it might be non-critical or different across regions.
			fmt.Printf("Warning: failed to assign role to user %v: %v\n", userID, err)
		}
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
	}

	return &domain.S3Credentials{
		AccessKey: s3Cred.Access,
		SecretKey: s3Cred.Secret,
		Endpoint:  fmt.Sprintf("https://s3.%s.io.cloud.ovh.net", r.region),
		Region:    r.region,
	}, nil
}
