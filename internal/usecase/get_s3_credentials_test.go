package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/snigle/photocloud/internal/domain"
)

type mockStorageRepository struct {
	getS3CredentialsFunc func(ctx context.Context, email string) (*domain.S3Credentials, error)
	getUserKeyFunc       func(ctx context.Context, email string) ([]byte, error)
	saveUserKeyFunc      func(ctx context.Context, email string, key []byte) error
}

func (m *mockStorageRepository) GetS3Credentials(ctx context.Context, email string) (*domain.S3Credentials, error) {
	return m.getS3CredentialsFunc(ctx, email)
}

func (m *mockStorageRepository) GetUserKey(ctx context.Context, email string) ([]byte, error) {
	return m.getUserKeyFunc(ctx, email)
}

func (m *mockStorageRepository) SaveUserKey(ctx context.Context, email string, key []byte) error {
	return m.saveUserKeyFunc(ctx, email, key)
}

// Implement other methods to satisfy UserStorage interface
func (m *mockStorageRepository) GetUser(ctx context.Context, email string) (domain.PasskeyUser, error) {
	return nil, nil
}
func (m *mockStorageRepository) SaveUser(ctx context.Context, email string, user domain.PasskeyUser) error {
	return nil
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
	userKey := []byte("01234567890123456789012345678901")

	mockRepo := &mockStorageRepository{
		getS3CredentialsFunc: func(ctx context.Context, email string) (*domain.S3Credentials, error) {
			if email != "test@example.com" {
				return nil, errors.New("unexpected email")
			}
			return expectedCreds, nil
		},
		getUserKeyFunc: func(ctx context.Context, email string) ([]byte, error) {
			return userKey, nil
		},
		saveUserKeyFunc: func(ctx context.Context, email string, key []byte) error {
			return nil
		},
	}

	uc := NewGetS3CredentialsUseCase(mockRepo, mockRepo)
	creds, err := uc.Execute(ctx, email)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if creds != expectedCreds {
		t.Errorf("expected %+v, got %+v", expectedCreds, creds)
	}
}

func TestGetS3CredentialsUseCase_Execute_GenerateKey(t *testing.T) {
	ctx := context.Background()
	email := "new@example.com"
	expectedCreds := &domain.S3Credentials{
		AccessKey: "access",
		SecretKey: "secret",
	}

	savedKey := []byte{}
	mockRepo := &mockStorageRepository{
		getS3CredentialsFunc: func(ctx context.Context, email string) (*domain.S3Credentials, error) {
			return expectedCreds, nil
		},
		getUserKeyFunc: func(ctx context.Context, email string) ([]byte, error) {
			return nil, errors.New("404: Not Found")
		},
		saveUserKeyFunc: func(ctx context.Context, email string, key []byte) error {
			savedKey = key
			return nil
		},
	}

	uc := NewGetS3CredentialsUseCase(mockRepo, mockRepo)
	creds, err := uc.Execute(ctx, email)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(savedKey) != 32 {
		t.Errorf("expected 32 bytes key to be saved, got %d bytes", len(savedKey))
	}

	if creds.UserKey == "" {
		t.Error("expected UserKey to be populated in credentials")
	}
}

func TestGetS3CredentialsUseCase_Execute_ErrorOnKeyFailure(t *testing.T) {
	ctx := context.Background()
	email := "error@example.com"

	mockRepo := &mockStorageRepository{
		getS3CredentialsFunc: func(ctx context.Context, email string) (*domain.S3Credentials, error) {
			return &domain.S3Credentials{}, nil
		},
		getUserKeyFunc: func(ctx context.Context, email string) ([]byte, error) {
			return nil, errors.New("unexpected S3 error")
		},
	}

	uc := NewGetS3CredentialsUseCase(mockRepo, mockRepo)
	_, err := uc.Execute(ctx, email)

	if err == nil {
		t.Error("expected error when GetUserKey fails with non-404 error, got nil")
	}
}
