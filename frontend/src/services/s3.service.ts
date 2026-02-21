import AWS from 'aws-sdk';
import type { S3Credentials, Photo } from '../domain/types';

export class S3Service {
  private s3: AWS.S3;

  constructor(creds: S3Credentials) {
    this.s3 = new AWS.S3({
      accessKeyId: creds.access,
      secretAccessKey: creds.secret,
      endpoint: creds.endpoint,
      region: creds.region,
      s3ForcePathStyle: true,
    });
  }

  async listPhotos(bucket: string, prefix: string): Promise<Photo[]> {
    const params = {
      Bucket: bucket,
      Prefix: prefix,
    };

    const data = await this.s3.listObjectsV2(params).promise();
    return (data.Contents || []).map(item => ({
      key: item.Key!,
      url: this.s3.getSignedUrl('getObject', {
        Bucket: bucket,
        Key: item.Key,
        Expires: 3600,
      }),
    }));
  }
}
