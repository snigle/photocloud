import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as Crypto from 'expo-crypto';
import type { IS3Repository, S3Credentials, UploadedPhoto } from '../domain/types';

export class S3Repository implements IS3Repository {
  private s3: S3Client;
  private creds: S3Credentials;
  private sseParams: { algorithm: string, key: string, keyMD5: string } | null = null;

  constructor(creds: S3Credentials) {
    this.creds = creds;
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: creds.access,
        secretAccessKey: creds.secret,
      },
      endpoint: creds.endpoint,
      region: creds.region,
      forcePathStyle: true,
    });
  }

  private async getSSE() {
    if (this.sseParams) return this.sseParams;

    const key = this.creds.user_key; // already base64
    const binaryKey = this.base64ToUint8Array(key);

    // Compute MD5 of the binary key
    // We use expo-crypto digest
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        this.uint8ArrayToBinaryString(binaryKey) // Digest works on strings or ArrayBuffers
    );
    // hash is hex string by default in digestStringAsync
    // We need base64 of the binary hash
    const binaryHash = this.hexToUint8Array(hash);
    const keyMD5 = this.uint8ArrayToBase64(binaryHash);

    this.sseParams = {
        algorithm: 'AES256',
        key: key,
        keyMD5: keyMD5
    };
    return this.sseParams;
  }

  async listPhotos(bucket: string, email: string): Promise<UploadedPhoto[]> {
    let allPhotos: UploadedPhoto[] = [];
    const basePrefix = `users/${email}/`;

    try {
        // 1. Try to get years from index.json for targeted listing
        let years: string[] = [];
        try {
            const indexKey = `${basePrefix}index.json`;
            const indexData = await this.getFile(bucket, indexKey);
            const index = JSON.parse(new TextDecoder().decode(indexData));
            if (index && Array.isArray(index.years)) {
                years = index.years.map((y: any) => y.toString());
            }
        } catch (e) {
            console.log('index.json might not exist yet or failed to read', e);
        }

        if (years.length > 0) {
            for (const year of years) {
                const yearPhotos = await this.listFolder(bucket, `${basePrefix}${year}/original/`);
                allPhotos = [...allPhotos, ...yearPhotos];
            }
        }

        // 2. Fallback: If no photos found in targeted folders, search more broadly
        if (allPhotos.length === 0) {
            const allFiles = await this.listFolder(bucket, basePrefix);
            allPhotos = allFiles.filter(p => p.key.includes('/original/'));
        }

        // 3. Last resort fallback
        if (allPhotos.length === 0) {
            const allFiles = await this.listFolder(bucket, basePrefix);
            allPhotos = allFiles.filter(p => p.key.endsWith('.enc') && !p.key.endsWith('.json.enc'));
        }

    } catch (err) {
        console.error('Error in listPhotos:', err);
        throw err;
    }

    const uniquePhotos = Array.from(new Map(allPhotos.map(p => [p.id, p])).values());
    return uniquePhotos;
  }

  private async listFolder(bucket: string, prefix: string): Promise<UploadedPhoto[]> {
    let folderPhotos: UploadedPhoto[] = [];
    let continuationToken: string | undefined = undefined;

    try {
        do {
            const command: ListObjectsV2Command = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            });

            const data = await this.s3.send(command);
            if (!data.Contents) break;

            const items: UploadedPhoto[] = data.Contents
              .filter(item => {
                  const key = item.Key || '';
                  return !key.endsWith('/');
              })
              .map(item => {
                const key = item.Key!;
                const parts = key.split('/');
                const filename = parts.pop()!;
                const timestampMatch = filename.match(/^(\d+)-/);
                const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;

                return {
                  id: filename.replace('.enc', '').replace('.json', ''),
                  key: key,
                  creationDate: timestamp || (item.LastModified ? Math.floor(item.LastModified.getTime() / 1000) : 0),
                  size: item.Size || 0,
                  width: 0,
                  height: 0,
                  type: 'cloud' as const,
                };
              });

            folderPhotos = [...folderPhotos, ...items];
            continuationToken = data.NextContinuationToken;
          } while (continuationToken);
    } catch (e) {
        console.error(`Error listing folder ${prefix}:`, e);
    }

    return folderPhotos;
  }

  async getDownloadUrl(bucket: string, key: string): Promise<string> {
    const sse = await this.getSSE();
    const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        SSECustomerAlgorithm: sse.algorithm,
        SSECustomerKey: sse.key,
        SSECustomerKeyMD5: sse.keyMD5,
      });
      return await getSignedUrl(this.s3, getObjectCommand, {
        expiresIn: 3600,
      });
  }

  async uploadFile(
    bucket: string,
    key: string,
    data: Uint8Array,
    contentType: string
  ): Promise<void> {
    const sse = await this.getSSE();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      SSECustomerAlgorithm: sse.algorithm,
      SSECustomerKey: sse.key,
      SSECustomerKeyMD5: sse.keyMD5,
    });

    await this.s3.send(command);
  }

  async getFile(bucket: string, key: string): Promise<Uint8Array> {
    const sse = await this.getSSE();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      SSECustomerAlgorithm: sse.algorithm,
      SSECustomerKey: sse.key,
      SSECustomerKeyMD5: sse.keyMD5,
    });

    const data = await this.s3.send(command);
    if (!data.Body) {
      throw new Error('No body in S3 response');
    }

    // Fixed transformation: consume stream fully and return Uint8Array
    const bytes = await (data.Body as any).transformToUint8Array();
    return new Uint8Array(bytes);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const sse = await this.getSSE();
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
        SSECustomerAlgorithm: sse.algorithm,
        SSECustomerKey: sse.key,
        SSECustomerKeyMD5: sse.keyMD5,
      });
      await this.s3.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private uint8ArrayToBinaryString(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
