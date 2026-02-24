import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { IS3Repository, ILocalGalleryRepository, S3Credentials, UploadedPhoto } from '../domain/types';
import { encodeText, decodeText, md5Hex } from '../infra/utils';
import { GlobalLock } from '../infra/locks';

export class UploadUseCase {
  private static indexedYears = new Set<string>();

  constructor(
    private s3Repo: IS3Repository,
    private localRepo: ILocalGalleryRepository
  ) {}

  async execute(
    uri: string,
    filename: string,
    creds: S3Credentials,
    email: string,
    shouldUploadOriginal: boolean = false,
    localId?: string,
    creationDate?: number
  ): Promise<UploadedPhoto | null> {
    // 1. Process images
    const originalData = await this.uriToUint8Array(uri);

    const hash = md5Hex(originalData);

    // Check if already exists in local cache (synced with cloud)
    if (await this.localRepo.existsById(hash)) {
        console.log(`Photo ${filename} already exists (hash: ${hash}), skipping upload.`);
        return null;
    }

    let timestamp = creationDate || Math.floor(Date.now() / 1000);

    // Try to get actual creation date from MediaLibrary if on native
    if (Platform.OS !== 'web') {
        try {
            const asset = await MediaLibrary.getAssetInfoAsync(uri);
            if (asset && asset.creationTime) {
                timestamp = Math.floor(asset.creationTime / 1000);
            }
        } catch (e) {
            console.log('Failed to get asset info for timestamp', e);
        }
    }

    const photoId = `${timestamp}-${hash}`;
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear().toString();

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

    if (localId) {
        await this.localRepo.markAsUploaded(localId, uploadedPhoto.id);
    }

    return uploadedPhoto;
  }

  private async uriToUint8Array(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async updateIndex(creds: S3Credentials, email: string, year: string): Promise<void> {
    const release = await GlobalLock.acquire(`index-${email}`);
    try {
        const indexKey = `users/${email}/index.json`;
        let index: { years: any[] } = { years: [] };

        const exists = await this.s3Repo.exists(creds.bucket, indexKey);
    if (exists) {
        try {
            const existingIndexData = await this.s3Repo.getFile(creds.bucket, indexKey);
            index = JSON.parse(decodeText(existingIndexData));
        } catch (e) {
            console.error('Failed to update index.json', e);
        }
    }

    // Ensure index.years is in the new format { year: string, count: number }[]
    index.years = index.years.map(y => {
        if (typeof y === 'string') return { year: y, count: 0 };
        return y;
    });

    let yearEntry = index.years.find(y => y.year === year);
    if (!yearEntry) {
        yearEntry = { year, count: 1 };
        index.years.push(yearEntry);
    } else {
        yearEntry.count++;
    }

    // Sort years descending
    index.years.sort((a, b) => b.year.localeCompare(a.year));

        await this.s3Repo.uploadFile(
            creds.bucket,
            indexKey,
            encodeText(JSON.stringify(index)),
            'application/json'
        );
        UploadUseCase.indexedYears.add(`${email}-${year}`);
    } finally {
        release();
    }
  }
}
