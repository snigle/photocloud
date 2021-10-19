package connectors

import (
	"context"

	"github.com/gophercloud/gophercloud"
	"github.com/gophercloud/gophercloud/openstack"
)

var (
	OpenstackUsername    = ""
	OpenstackPassword    = ""
	OpenstackIdentityURL = ""
	OpenstackProject     = ""
)

type IGophercloudConnector interface {
	Gophercloud(ctx context.Context) (*gophercloud.ProviderClient, error)
}

type GophercloudConnector struct {
}

func NewGophercloudConnector() IGophercloudConnector {
	return &GophercloudConnector{}
}

func (g *GophercloudConnector) Gophercloud(ctx context.Context) (*gophercloud.ProviderClient, error) {
	opts := gophercloud.AuthOptions{
		IdentityEndpoint: OpenstackIdentityURL,
		Username:         OpenstackUsername,
		Password:         OpenstackPassword,
		DomainName:       "Default",
		TenantID:         OpenstackProject,
	}
	provider, err := openstack.AuthenticatedClient(opts)
	if err != nil {
		return nil, err
	}
	return provider, nil
}
