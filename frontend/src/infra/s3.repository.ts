import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IS3Repository, S3Credentials, UploadedPhoto } from '../domain/types';
import { base64ToUint8Array, uint8ArrayToBase64, decodeText, md5 } from './utils';

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

  async listPhotos(bucket: string, email: string): Promise<UploadedPhoto[]> {
    let allPhotos: UploadedPhoto[] = [];
    const basePrefix = `users/${email}/`;

    try {
        // 1. Try to get years from index.json for targeted listing
        let years: string[] = [];
        try {
            const indexKey = `${basePrefix}index.json`;
            const indexData = await this.getFile(bucket, indexKey);
            const index = JSON.parse(decodeText(indexData));
            if (index && Array.isArray(index.years)) {
                years = index.years.map((y: any) => y.toString());
            }
        } catch (e) {
            console.log('index.json might not exist yet or failed to read', e);
        }

        if (years.length > 0) {
            for (const year of years) {
                const yearPhotos = await this.listFolder(bucket, `${basePrefix}${year}/thumbnail/`);
                allPhotos = [...allPhotos, ...yearPhotos];
            }
        }

        // 2. Fallback: If no photos found in targeted folders, search more broadly
        if (allPhotos.length === 0) {
            const allFiles = await this.listFolder(bucket, basePrefix);
            allPhotos = allFiles.filter(p => p.key.includes('/thumbnail/'));
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

    // Robust transformation: try transformToUint8Array first, then fallback to manual stream consumption
    if (typeof (data.Body as any).transformToUint8Array === 'function') {
        const bytes = await (data.Body as any).transformToUint8Array();
        return new Uint8Array(bytes);
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
        return result;
    }

    // Last resort: if it's already a Uint8Array or similar
    if (data.Body instanceof Uint8Array) {
        return data.Body;
    }

    throw new Error('Unsupported S3 body type');
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

  static get1080pKey(thumbnailKey: string): string {
    return thumbnailKey.replace('/thumbnail/', '/1080p/');
  }

  static getOriginalKey(thumbnailKey: string): string {
    return thumbnailKey.replace('/thumbnail/', '/original/');
  }

}
