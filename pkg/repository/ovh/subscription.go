package ovh

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gophercloud/gophercloud"
	"github.com/gophercloud/gophercloud/openstack"
	"github.com/gophercloud/gophercloud/openstack/objectstorage/v1/containers"
	"github.com/gophercloud/gophercloud/openstack/objectstorage/v1/objects"
	"github.com/ovh/go-ovh/ovh"
	"github.com/snigle/photocloud/pkg/domain"
	"github.com/snigle/photocloud/pkg/repository/connectors"
)

type subscription struct {
	ovh       connectors.IOVHConnector
	openstack connectors.IGophercloudConnector
}

func NewSubscriptionRep(ovh connectors.IOVHConnector, openstack connectors.IGophercloudConnector) domain.ISubscription {
	return &subscription{ovh: ovh, openstack: openstack}
}

const photocloudContainer = "photocloud"
const swiftRegion = "GRA"

type Credentials = struct {
	UserID      int
	ProjectID   string
	Mail        string
	Endpoint    string
	Container   string
	Region      string
	User        string
	Password    string
	Plan        string
	BilledUntil *time.Time
}

type OVHUser struct {
	ID       int
	Status   string
	Password string
	Username string
}

func (s *subscription) GetSubscription(ctx context.Context, customer domain.Customer) (*domain.Subscription, error) {
	provider, err := s.openstack.Gophercloud(ctx)
	if err != nil {
		return nil, err
	}
	client, err := openstack.NewObjectStorageV1(provider, gophercloud.EndpointOpts{Region: swiftRegion})
	if err != nil {
		return nil, err
	}

	creds := Credentials{}
	downloadedResp := objects.Download(client, photocloudContainer, customer.ID, objects.DownloadOpts{})
	err = downloadedResp.Err
	if err != nil {
		if errors.As(err, &gophercloud.ErrDefault404{}) {
			return nil, domain.ErrSubscriptionNotFound{Customer: customer}
		}
		return nil, err
	}
	bytes, err := downloadedResp.ExtractContent()
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(bytes, &creds)
	if err != nil {
		return nil, err
	}

	sub := domain.Subscription{
		CustomerID:  customer.ID,
		BilledUntil: creds.BilledUntil,
		Plan:        creds.Plan,
	}

	ovhClient, err := s.ovh.OVH(ctx)
	if err != nil {
		return nil, err
	}
	user := OVHUser{}
	err = ovhClient.Get(fmt.Sprintf("/cloud/project/%s/user/%d", ovhClient.ProjectID, creds.UserID), &user)
	if err != nil {
		return nil, err
	}
	switch user.Status {
	case "creating":
		sub.Status = domain.SubscriptionStatusCreating
	case "ok":
		sub.Status = domain.SubscriptionStatusOK
	default:
		return nil, fmt.Errorf("user %d has unmmaped status %s", creds.UserID, user.Status)
	}

	return &sub, nil
}

func (s *subscription) CreateSubscription(ctx context.Context, customer domain.Customer) (*domain.Subscription, error) {
	provider, err := s.openstack.Gophercloud(ctx)
	if err != nil {
		return nil, err
	}
	client, err := openstack.NewObjectStorageV1(provider, gophercloud.EndpointOpts{Region: swiftRegion})
	if err != nil {
		return nil, err
	}

	// Check photocloud container exists
	_, err = containers.Get(client, photocloudContainer, containers.GetOpts{}).Extract()
	if err != nil {
		return nil, fmt.Errorf("container photocloud not found: %w", err)
	}

	ovhClient, err := s.ovh.OVH(ctx)
	if err != nil {
		return nil, err
	}

	// create container if not exist
	container := struct {
		ID   string
		Name string
	}{}
	ovhContainerID := hex.EncodeToString([]byte(base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s.%s", customer.ID, swiftRegion)))))
	err = ovhClient.Get(fmt.Sprintf("/cloud/project/%s/storage/%s?noObjects=true", ovhClient.ProjectID, ovhContainerID), &container)
	if err != nil {
		httpErr := &ovh.APIError{}
		if !errors.As(err, &httpErr) || httpErr.Code != 404 {
			return nil, err
		}

		err = ovhClient.Post(fmt.Sprintf("/cloud/project/%s/storage", ovhClient.ProjectID), map[string]interface{}{"archive": false, "containerName": customer.ID, "region": swiftRegion}, &container)
		if err != nil {
			return nil, err
		}
	} else {
		container.ID = ovhContainerID
	}

	// Allow CORS on container
	err = ovhClient.Post(fmt.Sprintf("/cloud/project/%s/storage/%s/cors", ovhClient.ProjectID, ovhContainerID), map[string]interface{}{"origin": "*"}, nil)
	if err != nil {
		return nil, err
	}

	// Create user
	user := OVHUser{}
	err = ovhClient.Post(fmt.Sprintf("/cloud/project/%s/storage/%s/user", ovhClient.ProjectID, container.ID), map[string]string{"description": customer.ID, "right": "all"}, &user)
	if err != nil {
		return nil, err
	}

	// Save subscription
	credentials := Credentials{
		UserID:      user.ID,
		Mail:        customer.Mail,
		Endpoint:    connectors.OpenstackIdentityURL,
		Container:   container.Name,
		Password:    user.Password,
		User:        user.Username,
		ProjectID:   connectors.OpenstackProject,
		Region:      swiftRegion,
		Plan:        "free",
		BilledUntil: nil,
	}
	contentBytes, err := json.Marshal(credentials)
	if err != nil {
		return nil, err
	}

	err = objects.Create(client, photocloudContainer, customer.ID, objects.CreateOpts{ContentType: "application/json", Content: strings.NewReader(string(contentBytes))}).Err
	if err != nil {
		return nil, err
	}

	return &domain.Subscription{
		CustomerID:  customer.ID,
		BilledUntil: nil,
		Plan:        domain.PlanFree,
		Status:      user.Status,
	}, nil
}

func (s *subscription) GetSwiftCredentials(ctx context.Context, subscription domain.Subscription) (*domain.SwiftCredentials, error) {
	provider, err := s.openstack.Gophercloud(ctx)
	if err != nil {
		return nil, err
	}
	client, err := openstack.NewObjectStorageV1(provider, gophercloud.EndpointOpts{Region: swiftRegion})
	if err != nil {
		return nil, err
	}

	creds := Credentials{}
	resp := objects.Download(client, photocloudContainer, subscription.CustomerID, objects.DownloadOpts{})
	err = resp.Err
	if err != nil {
		return nil, err
	}
	bytes, err := resp.ExtractContent()
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(bytes, &creds)
	if err != nil {
		return nil, err
	}

	res := domain.SwiftCredentials{
		// Until keystone OVH doesn't allow CORS, need to proxify in our api
		// Endpoint:  creds.Endpoint,
		Endpoint:  connectors.OpenstackIdentityURLProxy,
		User:      creds.User,
		Password:  creds.Password,
		Container: creds.Container,
		ProjectID: creds.ProjectID,
		Region:    creds.Region,
	}
	return &res, nil
}
