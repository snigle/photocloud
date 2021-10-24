package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/loopfz/gadgeto/tonic"
	"github.com/snigle/photocloud/pkg/domain"
	"github.com/snigle/photocloud/pkg/repository/connectors"
	"github.com/snigle/photocloud/pkg/repository/google"
	"github.com/snigle/photocloud/pkg/repository/ovh"
	"github.com/snigle/photocloud/pkg/usecase"
	"github.com/wI2L/fizz"
)

func main() {
	engine := gin.Default()

	f := fizz.NewFromEngine(engine)
	f.POST("/1.0/login", nil, tonic.Handler(Login, 200))

	srv := &http.Server{
		Addr:    ":8080",
		Handler: f,
	}
	err := srv.ListenAndServe()
	if err != nil {
		log.Fatalf("fail to start server: %s", err)
	}
}

type LoginInput struct {
	AccessToken string `header:"X-Token" validate:"required"`
}
type LoginResponse struct {
	Customer         domain.Customer         `json:"customer,omitempty"`
	Subscription     domain.Subscription     `json:"subscription,omitempty"`
	SwiftCredentials domain.SwiftCredentials `json:"swiftCredentials,omitempty"`
}

func Login(c *gin.Context, in *LoginInput) (*LoginResponse, error) {
	customer, subscription, creds, err := usecase.NewLogin(
		google.NewCustomerRepo(connectors.NewGoogleConnector()),
		ovh.NewSubscriptionRep(connectors.NewOVHConnector(), connectors.NewGophercloudConnector()),
	).Login(c, in.AccessToken)
	if err != nil {
		return nil, err
	}
	return &LoginResponse{
		Customer:         *customer,
		Subscription:     *subscription,
		SwiftCredentials: *creds,
	}, nil
}
