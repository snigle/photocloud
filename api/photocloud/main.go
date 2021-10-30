package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
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
	f.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:8081"},
		AllowMethods:     []string{"POST"},
		AllowHeaders:     []string{"Origin", "x-token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	f.POST("/1.0/login", nil, tonic.Handler(Login, 200))
	f.OPTIONS("/1.0/login", nil, tonic.Handler(func(c *gin.Context) error { return nil }, 200))
	f.GET("/1.0/time", nil, tonic.Handler(func(c *gin.Context) error { return nil }, 200))

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
