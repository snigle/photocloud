package google

import (
	"context"

	"github.com/snigle/photocloud/pkg/domain"
	"github.com/snigle/photocloud/pkg/repository/connectors"
	"google.golang.org/api/oauth2/v2"
)

type customerRepo struct {
	google connectors.IGoogleConnector
}

func NewCustomerRepo(google connectors.IGoogleConnector) domain.ICustomer {
	return &customerRepo{google: google}
}

func (c *customerRepo) GetCustomer(ctx context.Context, accessToken string) (*domain.Customer, error) {
	client, err := c.google.Google(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	serviceAPI, err := oauth2.New(client)
	if err != nil {
		return nil, err
	}

	service, err := serviceAPI.Userinfo.V2.Me.Get().Do()
	if err != nil {
		return nil, err
	}

	return &domain.Customer{
		ID:   service.Id,
		Name: service.Name,
		Mail: service.Email,
	}, nil
}
