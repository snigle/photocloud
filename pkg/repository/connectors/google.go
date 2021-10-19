package connectors

import (
	"context"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	authapi "google.golang.org/api/oauth2/v2"
)

var (
	// from https://console.developers.google.com/project/<your-project-id>/apiui/credential
	GoogleClientID     = ""
	GoogleClientSecret = ""
)

type IGoogleConnector interface {
	Google(ctx context.Context, accessToken string) (*http.Client, error)
}

type GoogleConnector struct {
}

func NewGoogleConnector() IGoogleConnector {
	return &GoogleConnector{}
}

func (g *GoogleConnector) Google(ctx context.Context, accessToken string) (*http.Client, error) {
	var config = &oauth2.Config{
		ClientID:     GoogleClientID,
		ClientSecret: GoogleClientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       []string{authapi.UserinfoEmailScope},
	}
	token := &oauth2.Token{
		AccessToken: accessToken,
	}
	return config.Client(ctx, token), nil
}
