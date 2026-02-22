package domain

import (
	"context"
)

type UserInfo struct {
	Email string
}

type Authenticator interface {
	Authenticate(ctx context.Context, token string) (*UserInfo, error)
}

type MagicLinkAuthenticator interface {
	GenerateToken(ctx context.Context, email string) (string, error)
	ValidateToken(ctx context.Context, token string) (*UserInfo, error)
}

// Passkey related types
type PasskeyUser interface {
	WebAuthnID() []byte
	WebAuthnName() string
	WebAuthnDisplayName() string
	WebAuthnIcon() string
	GetCredentials() []PasskeyCredential
}

type PasskeyCredential struct {
	ID        []byte
	PublicKey []byte
	AttestationType string
	Transport []string
}

type UserStorage interface {
	GetUser(ctx context.Context, email string) (PasskeyUser, error)
	SaveUser(ctx context.Context, email string, user PasskeyUser) error
	GetUserKey(ctx context.Context, email string) ([]byte, error)
	SaveUserKey(ctx context.Context, email string, key []byte) error
}

type PasskeyUserEntity struct {
	Email       string
	Credentials []PasskeyCredential
}

func (u *PasskeyUserEntity) WebAuthnID() []byte          { return []byte(u.Email) }
func (u *PasskeyUserEntity) WebAuthnName() string        { return u.Email }
func (u *PasskeyUserEntity) WebAuthnDisplayName() string { return u.Email }
func (u *PasskeyUserEntity) WebAuthnIcon() string        { return "" }
func (u *PasskeyUserEntity) GetCredentials() []PasskeyCredential {
	return u.Credentials
}
