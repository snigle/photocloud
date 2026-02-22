import * as ImageManipulator from 'expo-image-manipulator';
import { IS3Repository, ILocalGalleryRepository, S3Credentials, UploadedPhoto } from '../domain/types';
import { encodeText, decodeText, md5Hex } from '../infra/utils';

export class UploadUseCase {
  constructor(
    private s3Repo: IS3Repository,
    private localRepo: ILocalGalleryRepository
  ) {}

  async execute(
    uri: string,
    filename: string,
    creds: S3Credentials,
    email: string,
    shouldUploadOriginal: boolean = false
  ): Promise<UploadedPhoto | null> {
    // 1. Process images
    const originalData = await this.uriToUint8Array(uri);

    const hash = md5Hex(originalData);

    // Check if already exists in local cache (synced with cloud)
    if (await this.localRepo.existsById(hash)) {
        console.log(`Photo ${filename} already exists (hash: ${hash}), skipping upload.`);
        return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const photoId = `${timestamp}-${hash}`;
    const year = new Date().getFullYear().toString();

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

    // 2. Upload
    // We no longer manually encrypt here because we use S3 SSE-C in the repository
    const basePrefix = `users/${email}/${year}`;

    const uploads = [
        this.s3Repo.uploadFile(
          creds.bucket,
          `${basePrefix}/1080p/${photoId}.enc`,
          reducedData,
          'application/octet-stream'
        ),
        this.s3Repo.uploadFile(
          creds.bucket,
          `${basePrefix}/thumbnail/${photoId}.enc`,
          thumbnailData,
          'application/octet-stream'
        )
    ];

    if (shouldUploadOriginal) {
        uploads.push(
            this.s3Repo.uploadFile(
                creds.bucket,
                `${basePrefix}/original/${photoId}.enc`,
                originalData,
                'application/octet-stream'
            )
        );
    }

    await Promise.all(uploads);

    // Metadata
    const metadata = {
      original_filename: filename,
      created_at: new Date().toISOString(),
    };
    const metadataData = encodeText(JSON.stringify(metadata));
    await this.s3Repo.uploadFile(
      creds.bucket,
      `${basePrefix}/metadata/${photoId}.json.enc`,
      metadataData,
      'application/octet-stream'
    );

    // Index
    await this.updateIndex(creds, email, year);

    const uploadedPhoto: UploadedPhoto = {
        id: hash,
        key: `${basePrefix}/thumbnail/${photoId}.enc`,
        creationDate: timestamp,
        size: thumbnailData.length,
        width: 0,
        height: 0,
        type: 'cloud'
    };

    await this.localRepo.savePhoto(uploadedPhoto);
    return uploadedPhoto;
  }

  private async uriToUint8Array(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async updateIndex(creds: S3Credentials, email: string, year: string): Promise<void> {
    const indexKey = `users/${email}/index.json`;
    let index: { years: string[] } = { years: [] };

    const exists = await this.s3Repo.exists(creds.bucket, indexKey);
    if (exists) {
        try {
            const existingIndexData = await this.s3Repo.getFile(creds.bucket, indexKey);
            index = JSON.parse(decodeText(existingIndexData));
        } catch (e) {
            console.error('Failed to update index.json', e);
        }
    }

    if (!index.years.includes(year)) {
        index.years.push(year);
        await this.s3Repo.uploadFile(
            creds.bucket,
            indexKey,
            encodeText(JSON.stringify(index)),
            'application/json'
        );
    }
  }
}
