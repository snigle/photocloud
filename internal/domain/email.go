package domain

import "context"

type EmailSender interface {
	SendEmail(ctx context.Context, to string, subject string, body string) error
}
