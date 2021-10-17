package domain

import "context"

type ICustomer interface {
	GetCustomer(ctx context.Context, accessToken string) (*Customer, error)
}

type Customer struct {
	ID   string
	Name string
	Mail string
}
