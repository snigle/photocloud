import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
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

  private async getSSE(customKey?: string | null) {
    if (customKey === null) return null;
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
        // 1. Discover all top-level folders for parallelism, excluding 'albums/' and 'config/'
        const folders = (await this.listFolders(bucket, basePrefix))
            .filter(f => !f.endsWith('/albums/') && !f.endsWith('/config/'));

        // Helper to add photos with filtering
        const addPhotos = (photos: UploadedPhoto[]) => {
            const albumsPrefix = `${basePrefix}albums/`;
            const configPrefix = `${basePrefix}config/`;
            for (const p of photos) {
                // Ignore photos in albums or config folders
                if (p.key.startsWith(albumsPrefix) || p.key.startsWith(configPrefix)) continue;
                // Exclude any keys that don't match our expected photo structure to avoid orphans
                if (!p.key.includes('/thumbnail/') && !p.key.includes('/original/') && !p.key.includes('/1080p/')) continue;

                const existing = allPhotosMap.get(p.id);
                // Prefer thumbnail keys for better gallery performance
                if (!existing || p.key.includes('/thumbnail/')) {
                    allPhotosMap.set(p.id, p);
                }
            }
        };

        // 2. List the 'thumbnail/' subfolder of each year in parallel
        if (folders.length > 0) {
            console.log(`S3Repository: Parallel thumbnail listing for ${folders.length} folders`);
            const concurrency = 5;
            for (let i = 0; i < folders.length; i += concurrency) {
                const chunk = folders.slice(i, i + concurrency);
                const results = await Promise.all(chunk.map(t => this.listFolder(bucket, `${t}thumbnail/`)));
                for (const photos of results) {
                    addPhotos(photos);
                }
            }
        }

        // 3. Also check for any files directly at the root of the user's directory
        const rootFiles = await this.listFolder(bucket, basePrefix, '/');
        addPhotos(rootFiles);

        // 4. Final safety fallback: if still empty, do one full broad recursive scan
        if (allPhotosMap.size === 0) {
            console.log('S3Repository: Still empty after targeted scans, performing full broad recursive fallback');
            const broad = await this.listFolder(bucket, basePrefix);
            addPhotos(broad);
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

  async getDownloadUrl(bucket: string, key: string, customSSEKey?: string | null): Promise<string> {
    const sse = await this.getSSE(customSSEKey);
    const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(sse ? {
            SSECustomerAlgorithm: sse.algorithm,
            SSECustomerKey: sse.key,
            SSECustomerKeyMD5: sse.keyMD5,
        } : {}),
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
    customSSEKey?: string | null
  ): Promise<void> {
    console.log(`S3: uploadFile ${key} (SSE: ${customSSEKey ? 'yes' : 'no'})`);
    const sse = await this.getSSE(customSSEKey);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      ...(sse ? {
        SSECustomerAlgorithm: sse.algorithm,
        SSECustomerKey: sse.key,
        SSECustomerKeyMD5: sse.keyMD5,
      } : {}),
    });

    await this.s3.send(command);
  }

  async getFile(bucket: string, key: string, customSSEKey?: string | null): Promise<Uint8Array> {
    console.log(`S3: getFile ${key} (SSE: ${customSSEKey ? 'yes' : 'no'})`);
    const isThumbnail = key.includes('/thumbnail/');
    if (isThumbnail && customSSEKey === undefined) {
        const cached = ThumbnailCache.get(key);
        if (cached) return cached.data;
    }

    const sse = await this.getSSE(customSSEKey);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(sse ? {
        SSECustomerAlgorithm: sse.algorithm,
        SSECustomerKey: sse.key,
        SSECustomerKeyMD5: sse.keyMD5,
      } : {}),
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

  async exists(bucket: string, key: string, customSSEKey?: string | null): Promise<boolean> {
    console.log(`S3: exists ${key}`);
    const sse = await this.getSSE(customSSEKey);
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(sse ? {
            SSECustomerAlgorithm: sse.algorithm,
            SSECustomerKey: sse.key,
            SSECustomerKeyMD5: sse.keyMD5,
        } : {}),
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

  async deleteFolder(bucket: string, prefix: string): Promise<void> {
      const keys = await this.listKeys(bucket, prefix);
      if (keys.length === 0) return;

      // Delete in batches of 1000
      for (let i = 0; i < keys.length; i += 1000) {
          const batch = keys.slice(i, i + 1000);
          const command = new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                  Objects: batch.map(k => ({ Key: k })),
                  Quiet: true,
              }
          });
          await this.s3.send(command);
      }
  }

  async listFolders(bucket: string, prefix: string): Promise<string[]> {
    console.log(`S3: listFolders ${prefix}`);
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

  async listKeys(bucket: string, prefix: string, delimiter?: string): Promise<string[]> {
    let keys: string[] = [];
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
      sourceSSEKey?: string | null,
      destSSEKey?: string | null
  ): Promise<void> {
      const sourceSSE = await this.getSSE(sourceSSEKey);
      const destSSE = await this.getSSE(destSSEKey);

      // CopySource must be URL-encoded, but the bucket and key separator should be a slash.
      // S3 expects the format: /bucket/key
      const encodedSourceKey = sourceKey.split('/').map(part => encodeURIComponent(part)).join('/');
      const command = new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodedSourceKey}`,
          Key: destKey,
          ...(sourceSSE ? {
              CopySourceSSECustomerAlgorithm: sourceSSE.algorithm,
              CopySourceSSECustomerKey: sourceSSE.key,
              CopySourceSSECustomerKeyMD5: sourceSSE.keyMD5,
          } : {}),
          ...(destSSE ? {
              SSECustomerAlgorithm: destSSE.algorithm,
              SSECustomerKey: destSSE.key,
              SSECustomerKeyMD5: destSSE.keyMD5,
          } : {}),
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
