package connectors

import (
	"context"

	"github.com/ovh/go-ovh/ovh"
)

var (
	OVHEndpoint          = "ovh-eu"
	OVHApplicationKey    = ""
	OVHApplicationSecret = ""
	OVHConsumerKey       = ""
)

type IOVHConnector interface {
	OVH(ctx context.Context) (*CustomClient, error)
}

type OVHConnector struct {
}

func NewOVHConnector() IOVHConnector {
	return &OVHConnector{}
}

type CustomClient struct {
	ovh.Client
	ProjectID string
}

func (g *OVHConnector) OVH(ctx context.Context) (*CustomClient, error) {
	client, err := ovh.NewClient(
		OVHEndpoint,
		OVHApplicationKey,
		OVHApplicationSecret,
		OVHConsumerKey,
	)
	if err != nil {
		return nil, err
	}
	return &CustomClient{Client: *client, ProjectID: OpenstackProject}, nil
}
