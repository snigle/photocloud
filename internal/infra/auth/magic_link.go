package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/snigle/photocloud/internal/domain"
)

type MagicLinkAuthenticator struct {
	secret []byte
	issuer string
}

func NewMagicLinkAuthenticator(secret string, issuer string) *MagicLinkAuthenticator {
	return &MagicLinkAuthenticator{
		secret: []byte(secret),
		issuer: issuer,
	}
}

type magicLinkClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func (a *MagicLinkAuthenticator) GenerateToken(ctx context.Context, email string) (string, error) {
	claims := magicLinkClaims{
		email,
		jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			Issuer:    a.issuer,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.secret)
}

func (a *MagicLinkAuthenticator) ValidateToken(ctx context.Context, tokenString string) (*domain.UserInfo, error) {
	token, err := jwt.ParseWithClaims(tokenString, &magicLinkClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	if claims, ok := token.Claims.(*magicLinkClaims); ok && token.Valid {
		return &domain.UserInfo{Email: claims.Email}, nil
	}

	return nil, errors.New("invalid token claims")
}
