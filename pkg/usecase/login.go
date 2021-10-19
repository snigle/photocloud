package usecase

import (
	"context"
	"errors"

	"github.com/snigle/photocloud/pkg/domain"
)

type login struct {
	customerRepo     domain.ICustomer
	subscriptionRepo domain.ISubscription
}

type Login interface {
	Login(ctx context.Context, accessToken string) (*domain.Customer, *domain.Subscription, *domain.SwiftCredentials, error)
}

func NewLogin(customerRepo domain.ICustomer,
	subscriptionRepo domain.ISubscription) Login {
	return login{
		customerRepo:     customerRepo,
		subscriptionRepo: subscriptionRepo,
	}
}

func (l login) Login(ctx context.Context, accessToken string) (*domain.Customer, *domain.Subscription, *domain.SwiftCredentials, error) {
	customer, err := l.customerRepo.GetCustomer(ctx, accessToken)
	if err != nil {
		return nil, nil, nil, err
	}

	sub, err := l.subscriptionRepo.GetSubscription(ctx, *customer)
	if err != nil {
		if !errors.As(err, &domain.ErrSubscriptionNotFound{}) {
			return nil, nil, nil, err
		}
		sub, err = l.subscriptionRepo.CreateSubscription(ctx, *customer)
		if err != nil {
			return nil, nil, nil, err
		}
	}

	creds, err := l.subscriptionRepo.GetSwiftCredentials(ctx, *sub)
	if err != nil {
		return nil, nil, nil, err
	}

	return customer, sub, creds, nil
}
