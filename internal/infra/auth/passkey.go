package auth

import (
	"context"
	"net/http"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/snigle/photocloud/internal/domain"
)

type PasskeyAuthenticator struct {
	webAuthn *webauthn.WebAuthn
	storage  domain.UserStorage
}

func NewPasskeyAuthenticator(storage domain.UserStorage, config *webauthn.Config) (*PasskeyAuthenticator, error) {
	w, err := webauthn.New(config)
	if err != nil {
		return nil, err
	}
	return &PasskeyAuthenticator{
		webAuthn: w,
		storage:  storage,
	}, nil
}

func (a *PasskeyAuthenticator) BeginRegistration(ctx context.Context, email string) (*protocol.CredentialCreation, *webauthn.SessionData, error) {
	user, err := a.storage.GetUser(ctx, email)
	if err != nil {
		user = &domain.PasskeyUserEntity{Email: email}
	}

	return a.webAuthn.BeginRegistration(&webauthnUserWrapper{user})
}

func (a *PasskeyAuthenticator) FinishRegistration(ctx context.Context, email string, sessionData webauthn.SessionData, response *http.Request) error {
	user, err := a.storage.GetUser(ctx, email)
	if err != nil {
		user = &domain.PasskeyUserEntity{Email: email}
	}

	credential, err := a.webAuthn.FinishRegistration(&webauthnUserWrapper{user}, sessionData, response)
	if err != nil {
		return err
	}

	pUser := user.(*domain.PasskeyUserEntity)
	pUser.Credentials = append(pUser.Credentials, domain.PasskeyCredential{
		ID:              credential.ID,
		PublicKey:       credential.PublicKey,
		AttestationType: credential.AttestationType,
		Transport:       convertFromWebAuthnTransport(credential.Transport),
	})

	return a.storage.SaveUser(ctx, email, pUser)
}

func (a *PasskeyAuthenticator) BeginLogin(ctx context.Context, email string) (*protocol.CredentialAssertion, *webauthn.SessionData, error) {
	user, err := a.storage.GetUser(ctx, email)
	if err != nil {
		return nil, nil, err
	}

	return a.webAuthn.BeginLogin(&webauthnUserWrapper{user})
}

func (a *PasskeyAuthenticator) FinishLogin(ctx context.Context, email string, sessionData webauthn.SessionData, response *http.Request) (*domain.UserInfo, error) {
	user, err := a.storage.GetUser(ctx, email)
	if err != nil {
		return nil, err
	}

	_, err = a.webAuthn.FinishLogin(&webauthnUserWrapper{user}, sessionData, response)
	if err != nil {
		return nil, err
	}

	return &domain.UserInfo{Email: email}, nil
}

func convertFromWebAuthnTransport(t []protocol.AuthenticatorTransport) []string {
	res := make([]string, len(t))
	for i, v := range t {
		res[i] = string(v)
	}
	return res
}

type webauthnUserWrapper struct {
	domain.PasskeyUser
}

func (w *webauthnUserWrapper) WebAuthnCredentials() []webauthn.Credential {
	creds := w.GetCredentials()
	res := make([]webauthn.Credential, len(creds))
	for i, c := range creds {
		res[i] = webauthn.Credential{
			ID:              c.ID,
			PublicKey:       c.PublicKey,
			AttestationType: c.AttestationType,
			Transport:       convertToWebAuthnTransport(c.Transport),
		}
	}
	return res
}


func convertToWebAuthnTransport(t []string) []protocol.AuthenticatorTransport {
	res := make([]protocol.AuthenticatorTransport, len(t))
	for i, v := range t {
		res[i] = protocol.AuthenticatorTransport(v)
	}
	return res
}
