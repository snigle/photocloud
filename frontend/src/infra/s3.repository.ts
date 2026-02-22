import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IS3Repository, S3Credentials, UploadedPhoto } from '../domain/types';

export class S3Repository implements IS3Repository {
  private s3: S3Client;

  constructor(creds: S3Credentials) {
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
            // index.json might not exist yet
        }

        if (years.length > 0) {
            for (const year of years) {
                const yearPhotos = await this.listFolder(bucket, `${basePrefix}${year}/original/`);
                allPhotos = [...allPhotos, ...yearPhotos];
            }
        }

        // 2. Fallback: If no photos found in targeted folders, search more broadly
        if (allPhotos.length === 0) {
            // List everything under the user's prefix and filter for any /original/ folder
            const allFiles = await this.listFolder(bucket, basePrefix);
            allPhotos = allFiles.filter(p => p.key.includes('/original/'));
        }

        // 3. Last resort: If still nothing, just return all .enc files we found
        if (allPhotos.length === 0) {
            const allFiles = await this.listFolder(bucket, basePrefix);
            allPhotos = allFiles.filter(p => p.key.endsWith('.enc') && !p.key.endsWith('.json.enc'));
        }

    } catch (err) {
        console.error('Error in listPhotos:', err);
        throw err;
    }

    // Deduplicate by ID just in case
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
                  // We want files, not "folders" (prefixes)
                  return !key.endsWith('/');
              })
              .map(item => {
                const key = item.Key!;
                const parts = key.split('/');
                const filename = parts.pop()!;

                // Try to parse timestamp from filename (e.g. 1712345678-uuid.enc)
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
    const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
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
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.s3.send(command);
  }

  async getFile(bucket: string, key: string): Promise<Uint8Array> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const data = await this.s3.send(command);
    if (!data.Body) {
      throw new Error('No body in S3 response');
    }
    return await (data.Body as any).transformToUint8Array();
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
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
}
