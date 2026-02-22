package domain

import "context"

type S3Credentials struct {
	AccessKey string `json:"access"`
	SecretKey string `json:"secret"`
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	Bucket    string `json:"bucket"`
	UserKey   string `json:"user_key"`
}

type StorageRepository interface {
	GetS3Credentials(ctx context.Context, email string) (*S3Credentials, error)
}
