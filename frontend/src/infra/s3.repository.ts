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

    try {
        // 1. Get available years from index.json
        const indexKey = `users/${email}/index.json`;
        let years: string[] = [];
        try {
            const indexData = await this.getFile(bucket, indexKey);
            const index = JSON.parse(new TextDecoder().decode(indexData));
            years = index.years || [];
        } catch (e) {
            console.log('No index.json found or failed to parse, listing root folder as fallback');
            // If no index.json, we can fallback to listing the whole prefix once
            // but the user wants us to use the targeted folders.
            // For a new user, years will be empty.
        }

        if (years.length === 0) {
            // Last resort fallback: list the root but it might be slow
            return await this.listFolder(bucket, `users/${email}/`);
        }

        // 2. List each year's original/ folder
        for (const year of years) {
            const yearPhotos = await this.listFolder(bucket, `users/${email}/${year}/original/`);
            allPhotos = [...allPhotos, ...yearPhotos];
        }

    } catch (err) {
        console.error('Error listing photos from S3:', err);
        throw err;
    }

    return allPhotos;
  }

  private async listFolder(bucket: string, prefix: string): Promise<UploadedPhoto[]> {
    let folderPhotos: UploadedPhoto[] = [];
    let continuationToken: string | undefined = undefined;

    do {
        const command: ListObjectsV2Command = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const data = await this.s3.send(command);
        const items: UploadedPhoto[] = (data.Contents || [])
          .filter(item => item.Key?.endsWith('.enc') && !item.Key?.endsWith('.json.enc'))
          .map(item => {
            const parts = item.Key!.split('/');
            const filename = parts.pop()!;
            const timestampMatch = filename.match(/^(\d+)-/);
            const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;

            return {
              id: filename.replace('.enc', ''),
              key: item.Key!,
              creationDate: timestamp,
              size: item.Size || 0,
              width: 0,
              height: 0,
              type: 'cloud' as const,
            };
          });

        folderPhotos = [...folderPhotos, ...items];
        continuationToken = data.NextContinuationToken;
      } while (continuationToken);

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
    // Depending on environment (web/native), we might need different transformations.
    // transformToUint8Array is available in recent SDK v3 versions.
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
