package usecase

import (
	"context"
	"github.com/snigle/photocloud/internal/domain"
)

type GetS3CredentialsUseCase struct {
	storageRepo domain.StorageRepository
}

func NewGetS3CredentialsUseCase(repo domain.StorageRepository) *GetS3CredentialsUseCase {
	return &GetS3CredentialsUseCase{storageRepo: repo}
}

func (uc *GetS3CredentialsUseCase) Execute(ctx context.Context, email string) (*domain.S3Credentials, error) {
	return uc.storageRepo.GetS3Credentials(ctx, email)
}
