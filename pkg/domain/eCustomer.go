package domain

import "context"

type ICustomer interface {
	GetCustomer(ctx context.Context, accessToken string) (*Customer, error)
}

type Customer struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Mail string `json:"mail"`
}
