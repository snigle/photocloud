package auth

import (
	"context"
	"errors"
	"os"

	"github.com/snigle/photocloud/internal/domain"
)

type DevAuthenticator struct {
	allowedEmails []string
}

func NewDevAuthenticator(allowedEmails []string) *DevAuthenticator {
	return &DevAuthenticator{allowedEmails: allowedEmails}
}

func (a *DevAuthenticator) Authenticate(ctx context.Context, email string) (*domain.UserInfo, error) {
	if os.Getenv("DEV_AUTH_ENABLED") != "true" {
		return nil, errors.New("dev auth is disabled")
	}

	if email == "" {
		return nil, errors.New("email is required")
	}

	allowed := false
	for _, e := range a.allowedEmails {
		if e == email {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, errors.New("email not allowed for dev auth")
	}

	return &domain.UserInfo{Email: email}, nil
}
