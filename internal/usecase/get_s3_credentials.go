package usecase

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"github.com/snigle/photocloud/internal/domain"
)

type GetS3CredentialsUseCase struct {
	storageRepo domain.StorageRepository
	userStorage domain.UserStorage
}

func NewGetS3CredentialsUseCase(repo domain.StorageRepository, userStorage domain.UserStorage) *GetS3CredentialsUseCase {
	return &GetS3CredentialsUseCase{
		storageRepo: repo,
		userStorage: userStorage,
	}
}

func (uc *GetS3CredentialsUseCase) Execute(ctx context.Context, email string) (*domain.S3Credentials, error) {
	creds, err := uc.storageRepo.GetS3Credentials(ctx, email)
	if err != nil {
		return nil, err
	}

	userKey, err := uc.userStorage.GetUserKey(ctx, email)
	if err != nil {
		// If key not found (or any error for this POC), generate a new one
		userKey = make([]byte, 32)
		if _, err := rand.Read(userKey); err != nil {
			return nil, fmt.Errorf("failed to generate user key: %w", err)
		}
		if err := uc.userStorage.SaveUserKey(ctx, email, userKey); err != nil {
			return nil, fmt.Errorf("failed to save user key: %w", err)
		}
	}

	creds.UserKey = base64.StdEncoding.EncodeToString(userKey)
	return creds, nil
}
