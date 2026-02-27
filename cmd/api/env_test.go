package main

import (
	"os"
	"testing"
)

func TestLoadEnv(t *testing.T) {
	content := "TEST_KEY=test_value\n# Comment\n  SPACED_KEY =  spaced_value  \nQUOTED_KEY=\"quoted_value\"\n"
	tmpFile, err := os.CreateTemp("", ".env")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(content); err != nil {
		t.Fatal(err)
	}
	tmpFile.Close()

	if err := loadEnv(tmpFile.Name()); err != nil {
		t.Fatalf("loadEnv failed: %v", err)
	}

	tests := []struct {
		key      string
		expected string
	}{
		{"TEST_KEY", "test_value"},
		{"SPACED_KEY", "spaced_value"},
		{"QUOTED_KEY", "quoted_value"},
	}

	for _, tt := range tests {
		val := os.Getenv(tt.key)
		if val != tt.expected {
			t.Errorf("expected %s=%s, got %s", tt.key, tt.expected, val)
		}
	}
}
