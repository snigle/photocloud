package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/snigle/photocloud/internal/domain"
	"google.golang.org/api/idtoken"
)

type GoogleAuthenticator struct {
	clientID string
}

func NewGoogleAuthenticator(clientID string) *GoogleAuthenticator {
	return &GoogleAuthenticator{clientID: clientID}
}

func (a *GoogleAuthenticator) Authenticate(ctx context.Context, token string) (*domain.UserInfo, error) {
	if a.clientID == "" {
		return nil, errors.New("google client id not configured")
	}

	payload, err := idtoken.Validate(ctx, token, a.clientID)
	if err != nil {
		return nil, fmt.Errorf("invalid google token: %w", err)
	}

	email, ok := payload.Claims["email"].(string)
	if !ok {
		return nil, errors.New("email not found in token")
	}

	return &domain.UserInfo{Email: email}, nil
}
