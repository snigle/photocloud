package usecase

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"log"
	"strings"

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
		// If the key is not found, generate a new one
		// We check for "404" or "NoSuchKey" in the error message as S3 errors are often strings when wrapped
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "NoSuchKey") {
			log.Printf("User key not found for %s, generating new one", email)
			userKey = make([]byte, 32)
			if _, err := rand.Read(userKey); err != nil {
				return nil, err
			}
			err = uc.userStorage.SaveUserKey(ctx, email, userKey)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}

	creds.UserKey = base64.StdEncoding.EncodeToString(userKey)
	return creds, nil
}
