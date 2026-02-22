package encryption

import (
	"bytes"
	"testing"
)

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32) // 256-bit key
	plaintext := []byte("hello world")

	ciphertext, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("encryption failed: %v", err)
	}

	decrypted, err := Decrypt(ciphertext, key)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if !bytes.Equal(plaintext, decrypted) {
		t.Errorf("expected %s, got %s", plaintext, decrypted)
	}
}
