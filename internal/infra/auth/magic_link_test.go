package auth

import (
	"context"
	"testing"
)

func TestMagicLinkAuthenticator(t *testing.T) {
	secret := "test-secret"
	issuer := "test-issuer"
	a := NewMagicLinkAuthenticator(secret, issuer)
	email := "user@example.com"

	token, err := a.GenerateToken(context.Background(), email)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	userInfo, err := a.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if userInfo.Email != email {
		t.Errorf("expected email %s, got %s", email, userInfo.Email)
	}
}
