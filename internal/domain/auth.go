package domain

import "context"

type UserInfo struct {
	Email string
}

type Authenticator interface {
	Authenticate(ctx context.Context, token string) (*UserInfo, error)
}
