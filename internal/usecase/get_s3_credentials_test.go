package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/snigle/photocloud/internal/domain"
)

type mockStorageRepository struct {
	getS3CredentialsFunc func(ctx context.Context, email string) (*domain.S3Credentials, error)
}

func (m *mockStorageRepository) GetS3Credentials(ctx context.Context, email string) (*domain.S3Credentials, error) {
	return m.getS3CredentialsFunc(ctx, email)
}

func TestGetS3CredentialsUseCase_Execute(t *testing.T) {
	ctx := context.Background()
	email := "test@example.com"
	expectedCreds := &domain.S3Credentials{
		AccessKey: "access",
		SecretKey: "secret",
		Endpoint:  "https://s3.gra.io.cloud.ovh.net",
		Region:    "gra",
	}

	mockRepo := &mockStorageRepository{
		getS3CredentialsFunc: func(ctx context.Context, email string) (*domain.S3Credentials, error) {
			if email != "test@example.com" {
				return nil, errors.New("unexpected email")
			}
			return expectedCreds, nil
		},
	}

	uc := NewGetS3CredentialsUseCase(mockRepo)
	creds, err := uc.Execute(ctx, email)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if creds != expectedCreds {
		t.Errorf("expected %+v, got %+v", expectedCreds, creds)
	}
}
