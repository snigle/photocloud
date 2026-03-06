package auth

import (
	"context"
	"errors"
	"os"

	"github.com/snigle/photocloud/internal/domain"
)

type DevAuthenticator struct {
}

func NewDevAuthenticator() *DevAuthenticator {
	return &DevAuthenticator{}
}

func (a *DevAuthenticator) Authenticate(ctx context.Context, email string) (*domain.UserInfo, error) {
	if os.Getenv("DEV_AUTH_ENABLED") != "true" {
		return nil, errors.New("dev auth is disabled")
	}

	if email == "" {
		return nil, errors.New("email is required")
	}

	return &domain.UserInfo{Email: email}, nil
}
