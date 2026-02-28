package main

import (
	"bufio"
	"encoding/base64"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/ovh/go-ovh/ovh"
	"github.com/rs/cors"
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

	// Handlers
	RegisterHandlers(
		http.DefaultServeMux,
		devAuth,
		googleAuth,
		magicLinkAuth,
		emailSender,
		webAuthn,
		getS3CredsUseCase,
	)

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
