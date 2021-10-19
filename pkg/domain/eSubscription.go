package domain

import (
	"context"
	"fmt"
	"time"
)

type ISubscription interface {
	GetSubscription(ctx context.Context, customer Customer) (*Subscription, error)
	CreateSubscription(ctx context.Context, customer Customer) (*Subscription, error)
	GetSwiftCredentials(ctx context.Context, subscription Subscription) (*SwiftCredentials, error)
	// TODO:
	// GetDiskUsage()
	// Upgrade(plan: Plan)
	// Renew()
	// Suspend()
	// Reopen()
	// Close()
}

type Subscription struct {
	CustomerID  string             `json:"customerId"`
	BilledUntil *time.Time         `json:"billedUntil"`
	Plan        Plan               `json:"plan"`
	Status      SubscriptionStatus `json:"status"`
}

type ErrSubscriptionNotFound struct {
	Customer Customer
}

func (e ErrSubscriptionNotFound) Error() string {
	return fmt.Sprintf("no subscription found for customer")
}
