# Storage Specification (No-DB)

This document describes how data is stored on S3 without a traditional database.

## Root Prefix
All user data is stored under the prefix: `users/{email}/`

## Directory Structure

### Photos and Metadata
Photos are organized by year to optimize S3 listing performance.

- `users/{email}/{year}/original/{photo_id}.enc`: High quality original photo (encrypted).
- `users/{email}/{year}/1080p/{photo_id}.enc`: Reduced size photo (1080p or 4k) (encrypted).
- `users/{email}/{year}/thumbnail/{photo_id}.enc`: Thumbnail (encrypted).
- `users/{email}/{year}/metadata/{photo_id}.json.enc`: Metadata JSON (encrypted) containing:
  - `original_filename`: Base name of the file.
  - `gps`: Coordinates if available.
  - `blurry`: Blurriness score.
  - `ia_tags`: Detected tags.
  - `created_at`: ISO date.

### Index
- `users/{email}/index.json`: JSON file listing all available years for the user.
  Example: `{"years": [2023, 2024]}`

### Encryption Key
- `users/{email}/secret.key`: 32-byte AES key used for client-side encryption.
  *Note: This file is stored on S3 encrypted with the MASTER_KEY and is provided in plaintext to the user upon authentication.*

### Albums
- `users/{email}/albums/{album_id}.json`: JSON file (encrypted or not, TBD) containing:
  - `name`: Album name.
  - `photos`: List of photo IDs (with their year).
  - `shared_with`: List of user emails who have access.

### Shared Albums (Incoming)
- `users/{email}/incoming/`: Prefix containing references to albums shared with this user.

## Client-Side Encryption
All photos and metadata are encrypted on the client side before being uploaded to S3.
- **Algorithm**: AES-GCM (256-bit).
- **Key**: The `user_key` (from `secret.key`).
- **IV**: A unique 12-byte IV must be used for each file and stored (e.g., prepended to the ciphertext).

## Web Upload Process
1.  **File Selection**: User selects a photo in the browser.
2.  **Local Processing**:
    -   Generate 1080p/4k version (Canvas API).
    -   Generate Thumbnail (Canvas API).
    -   Extract Metadata (Exif).
3.  **Encryption**:
    -   Encrypt Original, 1080p, Thumbnail, and Metadata JSON using `user_key`.
4.  **Upload**:
    -   Upload all 4 encrypted files to S3 using temporary credentials.
    -   Update `index.json` if a new year is introduced.
