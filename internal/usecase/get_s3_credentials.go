package usecase

import (
	"context"
	"encoding/base64"
	"log"

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
		log.Printf("Error getting user key for %s: %v", email, err)
		userKey = []byte{} // Use empty key if not found, to avoid regenerating
	}

	creds.UserKey = base64.StdEncoding.EncodeToString(userKey)
	return creds, nil
}
