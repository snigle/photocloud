package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-webauthn/webauthn/webauthn"
		"github.com/ovh/go-ovh/ovh"
	"github.com/rs/cors"
	"github.com/snigle/photocloud/internal/domain"
	"github.com/snigle/photocloud/internal/infra/auth"
	"github.com/snigle/photocloud/internal/infra/email"
	ovhinfra "github.com/snigle/photocloud/internal/infra/ovh"
	"github.com/snigle/photocloud/internal/usecase"
)

var Version = "dev"

func main() {
	// Disable AWS SDK EC2 IMDS lookup to avoid timeouts on Alwaysdata (non-AWS environment)
	os.Setenv("AWS_EC2_METADATA_DISABLED", "true")

	hostFlag := flag.String("host", "", "HTTP server address (e.g. [::]:8100)")
	envFlag := flag.String("env", "", "Path to .env file")
	flag.Parse()

	if *envFlag != "" {
		if err := loadEnv(*envFlag); err != nil {
			log.Fatalf("Error loading .env file: %v", err)
		}
	}

	// Load configuration from environment
	endpoint := os.Getenv("OVH_ENDPOINT")
	appKey := os.Getenv("OVH_APPLICATION_KEY")
	appSecret := os.Getenv("OVH_APPLICATION_SECRET")
	consumerKey := os.Getenv("OVH_CONSUMER_KEY")
	projectID := os.Getenv("OVH_PROJECT_ID")
	region := os.Getenv("OVH_REGION")
	bucket := os.Getenv("OVH_S3_BUCKET")
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")

	// Email config
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort, _ := strconv.Atoi(os.Getenv("SMTP_PORT"))
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	smtpFrom := os.Getenv("SMTP_FROM")

	// Auth secrets
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "default-secret-change-me"
	}

	masterKeyStr := os.Getenv("MASTER_KEY")
	var masterKey []byte
	if masterKeyStr != "" {
		var err error
		masterKey, err = base64.StdEncoding.DecodeString(masterKeyStr)
		if err != nil || len(masterKey) != 32 {
			if len(masterKeyStr) == 32 {
				masterKey = []byte(masterKeyStr)
			} else {
				log.Printf("Warning: MASTER_KEY must be a 32-byte base64 string or 32-byte raw string. Using dev key.")
				masterKey = []byte("dev-master-key-must-be-32-bytes-")
			}
		}
	} else {
		masterKey = []byte("dev-master-key-must-be-32-bytes-")
	}

	if region == "" {
		region = "gra" // Default region
	}

	ovhClient, err := ovh.NewClient(endpoint, appKey, appSecret, consumerKey)
	if err != nil {
		log.Fatalf("Failed to create OVH client: %v", err)
	}

	storageRepo := ovhinfra.NewStorageRepository(ovhClient, projectID, region, bucket, masterKey)
	getS3CredsUseCase := usecase.NewGetS3CredentialsUseCase(storageRepo, storageRepo)

	googleAuth := auth.NewGoogleAuthenticator(googleClientID)
	magicLinkAuth := auth.NewMagicLinkAuthenticator(jwtSecret, "photocloud-api")
	emailSender := email.NewSMTPEmailSender(smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom)
	devAuth := auth.NewDevAuthenticator("dev@photocloud.local")

	webAuthn, err := auth.NewPasskeyAuthenticator(storageRepo, &webauthn.Config{
		RPDisplayName: "Photo Cloud",
		RPID:          os.Getenv("RP_ID"),               // e.g. localhost or your domain
		RPOrigins:     []string{os.Getenv("RP_ORIGIN")}, // e.g. http://localhost:3000
	})
	if err != nil {
		log.Fatalf("Failed to create WebAuthn authenticator: %v", err)
	}

	// 0. Dev Auth
	http.HandleFunc("/auth/dev", func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEV_AUTH_ENABLED") != "true" {
			http.Error(w, "Dev auth disabled", http.StatusForbidden)
			return
		}
		userInfo, err := devAuth.Authenticate(r.Context(), "dev-token")
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

		// Force the test master key for dev user key to ensure consistent encryption for testing
		creds.UserKey = base64.StdEncoding.EncodeToString(masterKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AuthResponse{
			S3Credentials: creds,
			Email:         userInfo.Email,
		})
	})

	// 1. Google Auth
	http.HandleFunc("/auth/google", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		userInfo, err := googleAuth.Authenticate(r.Context(), token)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	})

	// 2. Magic Link
	http.HandleFunc("/auth/magic-link/request", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		redirectURL := r.URL.Query().Get("redirect_url")
		token, err := magicLinkAuth.GenerateToken(r.Context(), email)
		if err != nil {
			http.Error(w, "Internal error", http.StatusInternalServerError)
			return
		}

		frontendURL := os.Getenv("FRONTEND_URL")
		if frontendURL == "" {
			frontendURL = "http://localhost:8081" // Expo web default
		}

		// Security: Validate redirectURL to prevent open redirect vulnerabilities
		if redirectURL != "" {
			isValid := false
			// Check if it matches exactly or is a subpath of authorized origins
			allowedOrigins := []string{frontendURL, "photocloud://", "http://localhost:8081", "exp://"}
			for _, origin := range allowedOrigins {
				if redirectURL == origin || strings.HasPrefix(redirectURL, origin+"/") || strings.HasPrefix(redirectURL, origin+"?") {
					isValid = true
					break
				}
			}

			if !isValid {
				http.Error(w, "Invalid redirect_url", http.StatusBadRequest)
				return
			}
		} else {
			redirectURL = frontendURL
		}

		sep := "?"
		if strings.Contains(redirectURL, "?") {
			sep = "&"
		}

		body := "Click here to login: " + redirectURL + sep + "token=" + token
		err = emailSender.SendEmail(r.Context(), email, "Your Magic Link", body)
		if err != nil {
			http.Error(w, "Failed to send email", http.StatusInternalServerError)
			return
		}
		w.Write([]byte("Email sent"))
	})

	http.HandleFunc("/auth/magic-link/callback", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		userInfo, err := magicLinkAuth.ValidateToken(r.Context(), token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	})

	// 3. Passkeys (simplified)
	http.HandleFunc("/auth/passkey/register/begin", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		options, session, err := webAuthn.BeginRegistration(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sessionData, _ := json.Marshal(session)
		http.SetCookie(w, &http.Cookie{Name: "webauthn_session", Value: string(sessionData), Path: "/"})
		json.NewEncoder(w).Encode(options)
	})

	http.HandleFunc("/auth/passkey/register/finish", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		cookie, err := r.Cookie("webauthn_session")
		if err != nil {
			http.Error(w, "Session not found", http.StatusBadRequest)
			return
		}
		var session webauthn.SessionData
		json.Unmarshal([]byte(cookie.Value), &session)

		err = webAuthn.FinishRegistration(r.Context(), email, session, r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Write([]byte("Registration successful"))
	})

	http.HandleFunc("/auth/passkey/login/begin", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		options, session, err := webAuthn.BeginLogin(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sessionData, _ := json.Marshal(session)
		http.SetCookie(w, &http.Cookie{Name: "webauthn_session", Value: string(sessionData), Path: "/"})
		json.NewEncoder(w).Encode(options)
	})

	http.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(Version))
	})

	http.HandleFunc("/auth/passkey/login/finish", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		cookie, err := r.Cookie("webauthn_session")
		if err != nil {
			http.Error(w, "Session not found", http.StatusBadRequest)
			return
		}
		var session webauthn.SessionData
		json.Unmarshal([]byte(cookie.Value), &session)

		userInfo, err := webAuthn.FinishLogin(r.Context(), email, session, r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, userInfo.Email)
	})
	// Due to complexity of passkeys implementation in a single turn,
	// I'll focus on getting the structure right.

	// Legacy endpoint (for backward compatibility during migration)
	http.HandleFunc("/credentials", func(w http.ResponseWriter, r *http.Request) {
		email := r.Header.Get("X-User-Email")
		if email == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		returnS3Credentials(w, r, getS3CredsUseCase, email)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := *hostFlag
	if addr == "" {
		addr = ":" + port
	}

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-User-Email"},
		AllowCredentials: true,
	})

	handler := c.Handler(http.DefaultServeMux)

	log.Printf("Server starting on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

type AuthResponse struct {
	*domain.S3Credentials
	Email string `json:"email"`
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

func loadEnv(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		// Remove quotes if present
		if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
			value = value[1 : len(value)-1]
		}
		os.Setenv(key, value)
	}
	return scanner.Err()
}
