package main

import (
	"bytes"
	"flag"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
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

var (
	allowOrigin           string
	keystoneProxyEndpoint string
)

func init() {
	flag.StringVar(&allowOrigin, "cors-origin", "", "origin allowed for CORS")
	flag.StringVar(&keystoneProxyEndpoint, "keystone-url", "", "url of keystone to use this API as proxy if your keystone doesn't allow CORS")
}

func main() {
	flag.Parse()

	engine := gin.Default()

	f := fizz.NewFromEngine(engine)
	f.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:8081"},
		AllowMethods:     []string{"POST"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"*"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	f.POST("/1.0/login", nil, tonic.Handler(Login, 200))
	f.OPTIONS("/1.0/login", nil, tonic.Handler(func(c *gin.Context) error { return nil }, 200))
	f.GET("/1.0/time", nil, tonic.Handler(func(c *gin.Context) error { return nil }, 200))
	f.POST("/1.0/keystone/*proxy", nil, KeystoneProxy)
	f.OPTIONS("/1.0/keystone/*proxy", nil, tonic.Handler(func(c *gin.Context) error { return nil }, 200))

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

func KeystoneProxy(c *gin.Context) {
	keystoneURL := keystoneProxyEndpoint + strings.TrimPrefix(c.Request.RequestURI, "/1.0/keystone")
	requestBody, err := ioutil.ReadAll(c.Request.Body)
	if err != nil {
		c.String(500, "fail to read request body: %s", err)
		return
	}

	log.Printf("proxy to %s with body %s", keystoneURL, requestBody)

	req, err := http.NewRequest(c.Request.Method, keystoneURL, bytes.NewReader(requestBody))
	if err != nil {
		c.String(500, "fail to create request: %s", err)
		return
	}
	req.Header = c.Request.Header
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		c.String(500, "fail to call request: %s", err)
		return
	}

	for key, values := range response.Header {
		c.Writer.Header()[key] = values
	}
	c.Writer.WriteHeader(response.StatusCode)

	body, err := ioutil.ReadAll(response.Body)
	if err != nil {
		c.String(500, "fail to read response body: %s", err)
		return
	}
	c.Writer.Write(body)
}
