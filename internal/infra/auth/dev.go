package auth

import (
	"context"
	"errors"
	"os"

	"github.com/snigle/photocloud/internal/domain"
)

type DevAuthenticator struct {
	devEmail string
}

func NewDevAuthenticator(devEmail string) *DevAuthenticator {
	return &DevAuthenticator{devEmail: devEmail}
}

func (a *DevAuthenticator) Authenticate(ctx context.Context, token string) (*domain.UserInfo, error) {
	if os.Getenv("DEV_AUTH_ENABLED") != "true" {
		return nil, errors.New("dev auth is disabled")
	}

	// In dev mode, the "token" is ignored or must match a secret
	if token != "dev-token" {
		return nil, errors.New("invalid dev token")
	}

	return &domain.UserInfo{Email: a.devEmail}, nil
}
