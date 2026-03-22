package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/snigle/photocloud/internal/domain"
	"github.com/snigle/photocloud/internal/infra/auth"
	"github.com/snigle/photocloud/internal/infra/email"
	"github.com/snigle/photocloud/internal/usecase"
)

type AuthResponse struct {
	*domain.S3Credentials
	Email string `json:"email"`
}

func RegisterHandlers(
	mux *http.ServeMux,
	devAuth *auth.DevAuthenticator,
	googleAuth *auth.GoogleAuthenticator,
	magicLinkAuth *auth.MagicLinkAuthenticator,
	emailSender domain.EmailSender,
	webAuthn *auth.PasskeyAuthenticator,
	getS3CredsUseCase *usecase.GetS3CredentialsUseCase,
	masterKey []byte,
) {
	mux.HandleFunc("/auth/dev", handleDevAuth(devAuth, getS3CredsUseCase, masterKey))
	mux.HandleFunc("/auth/google", handleGoogleAuth(googleAuth, getS3CredsUseCase))
	mux.HandleFunc("/auth/magic-link/request", handleMagicLinkRequest(magicLinkAuth, emailSender))
	mux.HandleFunc("/auth/magic-link/callback", handleMagicLinkCallback(magicLinkAuth, getS3CredsUseCase))
	mux.HandleFunc("/auth/passkey/register/begin", handlePasskeyRegisterBegin(webAuthn))
	mux.HandleFunc("/auth/passkey/register/finish", handlePasskeyRegisterFinish(webAuthn))
	mux.HandleFunc("/auth/passkey/login/begin", handlePasskeyLoginBegin(webAuthn))
	mux.HandleFunc("/auth/passkey/login/finish", handlePasskeyLoginFinish(webAuthn, getS3CredsUseCase))
	mux.HandleFunc("/version", handleVersion())
	mux.HandleFunc("/credentials", handleCredentials(getS3CredsUseCase))
}

func handleDevAuth(devAuth *auth.DevAuthenticator, getS3CredsUseCase *usecase.GetS3CredentialsUseCase, masterKey []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEV_AUTH_ENABLED") != "true" {
			http.Error(w, "Dev auth disabled", http.StatusForbidden)
			return
		}
		email := r.URL.Query().Get("email")
		userInfo, err := devAuth.Authenticate(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		creds, err := getS3CredsUseCase.Execute(r.Context(), userInfo.Email)
		if err != nil {
			log.Printf("Error getting S3 credentials for dev: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AuthResponse{
			S3Credentials: creds,
			Email:         userInfo.Email,
		})
	}
}

func handleGoogleAuth(googleAuth *auth.GoogleAuthenticator, getS3CredsUseCase *usecase.GetS3CredentialsUseCase) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		userInfo, err := googleAuth.Authenticate(r.Context(), token)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	}
}

func isAllowedRedirect(redirectURL string) bool {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:8081"
	}
	allowedOrigins := []string{frontendURL, "photocloud://", "photocloud://login", "http://localhost:8081", "exp://", "https://photocloud.ovh"}
	for _, origin := range allowedOrigins {
		if redirectURL == origin || strings.HasPrefix(redirectURL, origin+"/") || strings.HasPrefix(redirectURL, origin+"?") {
			return true
		}
		// Special case for custom schemes that might not have a trailing slash in the whitelist
		if strings.HasSuffix(origin, "://") && strings.HasPrefix(redirectURL, origin) {
			return true
		}
	}
	return false
}

func handleMagicLinkRequest(magicLinkAuth *auth.MagicLinkAuthenticator, emailSender domain.EmailSender) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailAddr := r.URL.Query().Get("email")
		redirectURL := r.URL.Query().Get("redirect_url")
		token, err := magicLinkAuth.GenerateToken(r.Context(), emailAddr)
		if err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}

		if redirectURL != "" && !isAllowedRedirect(redirectURL) {
			http.Error(w, "Invalid redirect_url", http.StatusBadRequest)
			return
		}

		// Use the provided redirectURL if it's whitelisted, otherwise fallback to configured FRONTEND_URL
		appURL := redirectURL
		if appURL == "" {
			appURL = os.Getenv("FRONTEND_URL")
		}
		if appURL == "" {
			appURL = "https://photocloud.ovh"
		}

		// Ensure we don't have a trailing slash before appending the query param
		appURL = strings.TrimRight(appURL, "/")

		// We append the token directly to the app URL.
		// For static sites like GH Pages, keeping it in query params (or even hash) at the root level is safest.
		var loginURL string
		if strings.Contains(appURL, "#") {
			// If there is a hash, we put the token before it to ensure it's a real query param
			parts := strings.SplitN(appURL, "#", 2)
			base := parts[0]
			hash := parts[1]
			sep := "?"
			if strings.Contains(base, "?") {
				sep = "&"
			}
			loginURL = fmt.Sprintf("%s%stoken=%s#%s", base, sep, token, hash)
		} else {
			sep := "?"
			if strings.Contains(appURL, "?") {
				sep = "&"
			}
			loginURL = fmt.Sprintf("%s%stoken=%s", appURL, sep, token)
		}

		body := fmt.Sprintf(email.MagicLinkEmailTemplate, loginURL, loginURL)
		err = emailSender.SendEmail(r.Context(), emailAddr, "Lien de connexion Photo Cloud", body)
		if err != nil {
			http.Error(w, "Failed to send email", http.StatusInternalServerError)
			return
		}
		w.Write([]byte("Email sent"))
	}
}

func handleMagicLinkCallback(magicLinkAuth *auth.MagicLinkAuthenticator, getS3CredsUseCase *usecase.GetS3CredentialsUseCase) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		userInfo, err := magicLinkAuth.ValidateToken(r.Context(), token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	}
}

func handlePasskeyRegisterBegin(webAuthn *auth.PasskeyAuthenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		options, session, err := webAuthn.BeginRegistration(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sessionData, _ := json.Marshal(session)
		http.SetCookie(w, &http.Cookie{
			Name:  "webauthn_session",
			Value: base64.StdEncoding.EncodeToString(sessionData),
			Path:  "/",
		})
		json.NewEncoder(w).Encode(options)
	}
}

func handlePasskeyRegisterFinish(webAuthn *auth.PasskeyAuthenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		cookie, err := r.Cookie("webauthn_session")
		if err != nil {
			http.Error(w, "Session not found", http.StatusBadRequest)
			return
		}

		sessionData, err := base64.StdEncoding.DecodeString(cookie.Value)
		if err != nil {
			http.Error(w, "Invalid session encoding", http.StatusBadRequest)
			return
		}

		var session webauthn.SessionData
		json.Unmarshal(sessionData, &session)

		err = webAuthn.FinishRegistration(r.Context(), email, session, r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Write([]byte("Registration successful"))
	}
}

func handlePasskeyLoginBegin(webAuthn *auth.PasskeyAuthenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		options, session, err := webAuthn.BeginLogin(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sessionData, _ := json.Marshal(session)
		http.SetCookie(w, &http.Cookie{
			Name:  "webauthn_session",
			Value: base64.StdEncoding.EncodeToString(sessionData),
			Path:  "/",
		})
		json.NewEncoder(w).Encode(options)
	}
}

func handlePasskeyLoginFinish(webAuthn *auth.PasskeyAuthenticator, getS3CredsUseCase *usecase.GetS3CredentialsUseCase) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		cookie, err := r.Cookie("webauthn_session")
		if err != nil {
			http.Error(w, "Session not found", http.StatusBadRequest)
			return
		}

		sessionData, err := base64.StdEncoding.DecodeString(cookie.Value)
		if err != nil {
			http.Error(w, "Invalid session encoding", http.StatusBadRequest)
			return
		}

		var session webauthn.SessionData
		json.Unmarshal(sessionData, &session)

		userInfo, err := webAuthn.FinishLogin(r.Context(), email, session, r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	}
}

func handleVersion() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(Version))
	}
}

func handleCredentials(getS3CredsUseCase *usecase.GetS3CredentialsUseCase) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.Header.Get("X-User-Email")
		if email == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, email)
	}
}

func returnS3Credentials(w http.ResponseWriter, r *http.Request, useCase *usecase.GetS3CredentialsUseCase, email string) {
	creds, err := useCase.Execute(r.Context(), email)
	if err != nil {
		log.Printf("Error getting S3 credentials for %s: %v", email, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		S3Credentials: creds,
		Email:         email,
	})
}
