import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Credentials, Photo } from '../domain/types';

export class S3Service {
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

  async listPhotos(bucket: string, prefix: string): Promise<Photo[]> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const data = await this.s3.send(command);
    const photos: Promise<Photo>[] = (data.Contents || []).map(async item => {
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: item.Key!,
      });
      const url = await getSignedUrl(this.s3, getObjectCommand, {
        expiresIn: 3600,
      });

      return {
        key: item.Key!,
        url: url,
      };
    });

    return Promise.all(photos);
  }
}
