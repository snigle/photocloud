import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { IS3Repository, S3Credentials } from '../domain/types';

export class UploadUseCase {
  constructor(private s3Repo: IS3Repository) {}

  async execute(
    uri: string,
    filename: string,
    creds: S3Credentials,
    email: string
  ): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const photoId = `${timestamp}-${Crypto.randomUUID ? Crypto.randomUUID() : Math.random().toString(36).substring(2, 15)}`;
    const year = new Date().getFullYear().toString();
    const userKey = this.base64ToUint8Array(creds.user_key);

    // 1. Process images
    const originalData = await this.uriToUint8Array(uri);

    const reducedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }], // 1080p roughly
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    const reducedData = await this.uriToUint8Array(reducedImage.uri);

    const thumbnailImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 300 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    const thumbnailData = await this.uriToUint8Array(thumbnailImage.uri);

    // 2. Encrypt
    const encryptedOriginal = await this.encrypt(originalData, userKey);
    const encryptedReduced = await this.encrypt(reducedData, userKey);
    const encryptedThumbnail = await this.encrypt(thumbnailData, userKey);

    // 3. Upload
    const basePrefix = `users/${email}/${year}`;

    await Promise.all([
        this.s3Repo.uploadFile(
          creds.bucket,
          `${basePrefix}/original/${photoId}.enc`,
          encryptedOriginal,
          'application/octet-stream'
        ),
        this.s3Repo.uploadFile(
          creds.bucket,
          `${basePrefix}/1080p/${photoId}.enc`,
          encryptedReduced,
          'application/octet-stream'
        ),
        this.s3Repo.uploadFile(
          creds.bucket,
          `${basePrefix}/thumbnail/${photoId}.enc`,
          encryptedThumbnail,
          'application/octet-stream'
        )
    ]);

    // Metadata
    const metadata = {
      original_filename: filename,
      created_at: new Date().toISOString(),
    };
    const metadataData = new TextEncoder().encode(JSON.stringify(metadata));
    const encryptedMetadata = await this.encrypt(metadataData, userKey);
    await this.s3Repo.uploadFile(
      creds.bucket,
      `${basePrefix}/metadata/${photoId}.json.enc`,
      encryptedMetadata,
      'application/octet-stream'
    );

    // Index
    await this.updateIndex(creds, email, year);
  }

  private async uriToUint8Array(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async encrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const iv = Crypto.getRandomBytes(12);

    // For web mode as requested, we use SubtleCrypto.
    // On native, this would need a polyfill or a different library.
    const cryptoSubtle = typeof window !== 'undefined' ? window.crypto?.subtle : (global as any).crypto?.subtle;

    if (!cryptoSubtle) {
      throw new Error('Crypto Subtle not available in this environment');
    }

    const cryptoKey = await cryptoSubtle.importKey(
      'raw',
      key,
      'AES-GCM',
      false,
      ['encrypt']
    );
    const ciphertext = await cryptoSubtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result;
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async updateIndex(creds: S3Credentials, email: string, year: string): Promise<void> {
    const indexKey = `users/${email}/index.json`;
    let index: { years: string[] } = { years: [] };
    try {
        const existingIndexData = await this.s3Repo.getFile(creds.bucket, indexKey);
        index = JSON.parse(new TextDecoder().decode(existingIndexData));
    } catch (e) {
        // Ignore
    }

    if (!index.years.includes(year)) {
        index.years.push(year);
        await this.s3Repo.uploadFile(
            creds.bucket,
            indexKey,
            new TextEncoder().encode(JSON.stringify(index)),
            'application/json'
        );
    }
  }
}
