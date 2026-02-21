package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/ovh/go-ovh/ovh"
	ovhinfra "github.com/snigle/photocloud/internal/infra/ovh"
	"github.com/snigle/photocloud/internal/usecase"
)

func main() {
	// Load configuration from environment
	endpoint := os.Getenv("OVH_ENDPOINT")
	appKey := os.Getenv("OVH_APPLICATION_KEY")
	appSecret := os.Getenv("OVH_APPLICATION_SECRET")
	consumerKey := os.Getenv("OVH_CONSUMER_KEY")
	projectID := os.Getenv("OVH_PROJECT_ID")
	region := os.Getenv("OVH_REGION")
	bucket := os.Getenv("OVH_S3_BUCKET")

	if region == "" {
		region = "gra" // Default region
	}

	ovhClient, err := ovh.NewClient(endpoint, appKey, appSecret, consumerKey)
	if err != nil {
		log.Fatalf("Failed to create OVH client: %v", err)
	}

	storageRepo := ovhinfra.NewStorageRepository(ovhClient, projectID, region, bucket)
	getS3CredsUseCase := usecase.NewGetS3CredentialsUseCase(storageRepo)

	http.HandleFunc("/credentials", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Mock authentication: get email from header
		email := r.Header.Get("X-User-Email")
		if email == "" {
			http.Error(w, "Unauthorized: X-User-Email header is required", http.StatusUnauthorized)
			return
		}

		creds, err := getS3CredsUseCase.Execute(r.Context(), email)
		if err != nil {
			log.Printf("Error getting S3 credentials for %s: %v", email, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(creds)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
