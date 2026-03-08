import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IS3Repository, S3Credentials, UploadedPhoto } from '../domain/types';
import { base64ToUint8Array, uint8ArrayToBase64, decodeText, md5 } from './utils';
import { ThumbnailCache } from './thumbnail-cache';

// Cache S3 clients by credentials to reuse connection pools
const s3Clients = new Map<string, S3Client>();

export class S3Repository implements IS3Repository {
  private s3: S3Client;
  private creds: S3Credentials;
  private sseParams: { algorithm: string, key: string, keyMD5: string } | null = null;

  constructor(creds: S3Credentials) {
    this.creds = creds;
    const clientKey = `${creds.access}:${creds.endpoint}:${creds.region}`;

    if (!s3Clients.has(clientKey)) {
        s3Clients.set(clientKey, new S3Client({
            credentials: {
              accessKeyId: creds.access,
              secretAccessKey: creds.secret,
            },
            endpoint: creds.endpoint,
            region: creds.region,
            forcePathStyle: true,
        }));
    }

    this.s3 = s3Clients.get(clientKey)!;
  }

  private async getSSE(customKey?: string) {
    if (customKey) {
        const binaryKey = base64ToUint8Array(customKey);
        const hash = md5(binaryKey);
        const keyMD5 = uint8ArrayToBase64(hash);
        return {
            algorithm: 'AES256',
            key: customKey,
            keyMD5: keyMD5
        };
    }

    if (this.sseParams) return this.sseParams;

    const key = this.creds.user_key; // already base64
    const binaryKey = base64ToUint8Array(key);

    // Compute MD5 of the binary key using our cross-platform utility
    const hash = md5(binaryKey);

    const keyMD5 = uint8ArrayToBase64(hash);

    this.sseParams = {
        algorithm: 'AES256',
        key: key,
        keyMD5: keyMD5
    };
    return this.sseParams;
  }

  async getCloudIndex(bucket: string, email: string): Promise<{ years: { year: string, count: number }[] }> {
    const indexKey = `users/${email}/index.json`;
    try {
        const exists = await this.exists(bucket, indexKey);
        if (!exists) return { years: [] };

        const indexData = await this.getFile(bucket, indexKey);
        const index = JSON.parse(decodeText(indexData));
        if (index && Array.isArray(index.years)) {
            const normalizedYears = index.years.map((y: any) => {
                if (typeof y === 'string') return { year: y, count: 0 };
                return y;
            });
            return { years: normalizedYears };
        }
    } catch (e) {
        if ((e as any).name !== 'NoSuchKey' && (e as any).$metadata?.httpStatusCode !== 404) {
            console.error('Failed to get cloud index', e);
        }
    }
    return { years: [] };
  }

  async listPhotos(bucket: string, email: string): Promise<UploadedPhoto[]> {
    const allPhotosMap = new Map<string, UploadedPhoto>();
    const basePrefix = `users/${email}/`;

    try {
        // 1. Discover all top-level folders for parallelism
        const folders = await this.listFolders(bucket, basePrefix);

        // 2. List each discovered folder recursively in parallel
        if (folders.length > 0) {
            console.log(`S3Repository: Parallel recursive listing for ${folders.length} folders`);
            const concurrency = 5;
            for (let i = 0; i < folders.length; i += concurrency) {
                const chunk = folders.slice(i, i + concurrency);
                const results = await Promise.all(chunk.map(t => this.listFolder(bucket, t)));
                for (const photos of results) {
                    for (const p of photos) {
                        const existing = allPhotosMap.get(p.id);
                        // Prefer thumbnail keys for better gallery performance
                        if (!existing || p.key.includes('/thumbnail/')) {
                            allPhotosMap.set(p.id, p);
                        }
                    }
                }
            }
        }

        // 3. Also check for any files directly at the root of the user's directory
        const rootFiles = await this.listFolder(bucket, basePrefix, '/');
        for (const p of rootFiles) {
            const existing = allPhotosMap.get(p.id);
            if (!existing || p.key.includes('/thumbnail/')) {
                allPhotosMap.set(p.id, p);
            }
        }

        // 4. Final safety fallback: if still empty, do one full broad recursive scan
        // This handles cases where folder discovery might have failed
        if (allPhotosMap.size === 0) {
            console.log('S3Repository: Still empty after targeted scans, performing full broad recursive fallback');
            const broad = await this.listFolder(bucket, basePrefix);
            for (const p of broad) {
                const existing = allPhotosMap.get(p.id);
                if (!existing || p.key.includes('/thumbnail/')) {
                    allPhotosMap.set(p.id, p);
                }
            }
        }

    } catch (err) {
        console.error('Error in listPhotos:', err);
    }

    const uniquePhotos = Array.from(allPhotosMap.values());
    console.log(`S3Repository: Synchronization found ${uniquePhotos.length} unique photos for ${email}`);
    return uniquePhotos;
  }

  private async listFolder(bucket: string, prefix: string, delimiter?: string): Promise<UploadedPhoto[]> {
    let folderPhotos: UploadedPhoto[] = [];
    let continuationToken: string | undefined = undefined;

    try {
        do {
            const command: ListObjectsV2Command = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              Delimiter: delimiter,
              ContinuationToken: continuationToken,
            });

            const data = await this.s3.send(command);
            if (!data.Contents) break;

            const items: UploadedPhoto[] = data.Contents
              .filter(item => {
                  const key = item.Key || '';
                  return !key.endsWith('/') && !key.endsWith('index.json') && key.endsWith('.enc');
              })
              .map(item => {
                const key = item.Key!;
                const parts = key.split('/');
                const filename = parts.pop()!;

                const namePart = filename.replace('.enc', '').replace('.json', '');
                const timestampMatch = namePart.match(/^(\d+)-/);
                const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
                const id = timestampMatch ? namePart.substring(timestampMatch[0].length) : namePart;

                return {
                  id: id,
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

  async getDownloadUrl(bucket: string, key: string, customSSEKey?: string): Promise<string> {
    const sse = await this.getSSE(customSSEKey);
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
    contentType: string,
    customSSEKey?: string
  ): Promise<void> {
    const sse = await this.getSSE(customSSEKey);
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

  async getFile(bucket: string, key: string, customSSEKey?: string): Promise<Uint8Array> {
    const isThumbnail = key.includes('/thumbnail/');
    if (isThumbnail && !customSSEKey) {
        const cached = ThumbnailCache.get(key);
        if (cached) return cached.data;
    }

    const sse = await this.getSSE(customSSEKey);
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

    // Robust transformation: try transformToUint8Array first, then fallback to manual stream consumption
    if (typeof (data.Body as any).transformToUint8Array === 'function') {
        const bytes = await (data.Body as any).transformToUint8Array();
        const result = new Uint8Array(bytes);
        if (isThumbnail) {
            ThumbnailCache.set(key, { data: result });
        }
        return result;
    }

    // Fallback for environments where transformToUint8Array is not available (e.g. some browser versions)
    const reader = (data.Body as any).getReader ? (data.Body as any).getReader() : null;
    if (reader) {
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        if (isThumbnail) {
            ThumbnailCache.set(key, { data: result });
        }
        return result;
    }

    // Last resort: if it's already a Uint8Array or similar
    if (data.Body instanceof Uint8Array) {
        const result = data.Body as Uint8Array;
        if (isThumbnail) {
            ThumbnailCache.set(key, { data: result });
        }
        return result;
    }

    throw new Error('Unsupported S3 body type');
  }

  async exists(bucket: string, key: string, customSSEKey?: string): Promise<boolean> {
    const sse = await this.getSSE(customSSEKey);
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

  async deleteFile(bucket: string, key: string): Promise<void> {
      const command = new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
      });
      await this.s3.send(command);
  }

  async listFolders(bucket: string, prefix: string): Promise<string[]> {
    let folders: string[] = [];
    let continuationToken: string | undefined = undefined;

    try {
        do {
            const command: ListObjectsV2Command = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              Delimiter: '/',
              ContinuationToken: continuationToken,
            });
            const data = await this.s3.send(command);
            if (data.CommonPrefixes) {
                folders = [...folders, ...data.CommonPrefixes.map(p => p.Prefix!)];
            }
            continuationToken = data.NextContinuationToken;
        } while (continuationToken);
    } catch (e) {
        console.error(`Error listing folders for prefix ${prefix}:`, e);
    }

    return folders;
  }

  async listKeys(bucket: string, prefix: string): Promise<string[]> {
    let keys: string[] = [];
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

            const batch = data.Contents
              .filter(item => {
                  const key = item.Key || '';
                  return !key.endsWith('/');
              })
              .map(item => item.Key!);

            keys = [...keys, ...batch];
            continuationToken = data.NextContinuationToken;
          } while (continuationToken);
    } catch (e) {
        console.error(`Error listing keys for prefix ${prefix}:`, e);
    }

    return keys;
  }

  async copyObject(
      bucket: string,
      sourceKey: string,
      destKey: string,
      sourceSSEKey?: string,
      destSSEKey?: string
  ): Promise<void> {
      const sourceSSE = await this.getSSE(sourceSSEKey);
      const destSSE = await this.getSSE(destSSEKey);

      const command = new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${sourceKey}`,
          Key: destKey,
          CopySourceSSECustomerAlgorithm: sourceSSE.algorithm,
          CopySourceSSECustomerKey: sourceSSE.key,
          CopySourceSSECustomerKeyMD5: sourceSSE.keyMD5,
          SSECustomerAlgorithm: destSSE.algorithm,
          SSECustomerKey: destSSE.key,
          SSECustomerKeyMD5: destSSE.keyMD5,
          MetadataDirective: 'COPY',
      });

      await this.s3.send(command);
  }

  static get1080pKey(thumbnailKey: string): string {
    return thumbnailKey.replace('/thumbnail/', '/1080p/');
  }

  static getOriginalKey(thumbnailKey: string): string {
    return thumbnailKey.replace('/thumbnail/', '/original/');
  }

}
