package domain

type SwiftCredentials struct {
	Endpoint  string `json:"endpoint"`
	User      string `json:"user"`
	Password  string `json:"password"`
	ProjectID string `json:"projectId"`
	Container string `json:"container"`
	Region    string `json:"region"`
}
