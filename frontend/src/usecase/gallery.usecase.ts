import { IS3Repository, ILocalGalleryRepository, Photo, S3Credentials } from '../domain/types';

export class GalleryUseCase {
  constructor(
    private s3Repo: IS3Repository,
    private localRepo: ILocalGalleryRepository
  ) {}

  /**
   * Syncs both local and cloud photos and updates the local cache.
   * This can be a long-running process for many photos.
   */
  async sync(creds: S3Credentials, email: string): Promise<void> {
    try {
        // Fetch local photos
        const local = await this.localRepo.listLocalPhotos();

        // Fetch cloud photos
        const cloud = await this.s3Repo.listPhotos(creds.bucket, email);

        // De-duplicate local photos that are already uploaded
        const uploadedLocalIds = await this.localRepo.getUploadedLocalIds();
        const filteredLocal = local.filter(p => !uploadedLocalIds.has(p.id));

        // Merge and sort
        const all = [...filteredLocal, ...cloud].sort((a, b) => b.creationDate - a.creationDate);

        // Update cache
        await this.localRepo.saveToCache(all);
    } catch (e) {
        console.error('GalleryUseCase sync error:', e);
        throw e;
    }
  }

  /**
   * Loads photos from the local cache with pagination.
   */
  async getPhotos(limit: number, offset: number): Promise<Photo[]> {
      return await this.localRepo.loadFromCache(limit, offset);
  }

  async getTotalCount(): Promise<number> {
      return await this.localRepo.countPhotos();
  }

  async deletePhoto(creds: S3Credentials, photo: Photo): Promise<void> {
    try {
        if (photo.type === 'cloud') {
            const thumbnailKey = photo.key;
            const p1080Key = thumbnailKey.replace('/thumbnail/', '/1080p/');
            const originalKey = thumbnailKey.replace('/thumbnail/', '/original/');

            // Delete all versions from S3
            await this.s3Repo.deleteFile(creds.bucket, thumbnailKey);
            await this.s3Repo.deleteFile(creds.bucket, p1080Key);
            await this.s3Repo.deleteFile(creds.bucket, originalKey);
        }

        // Always remove from local cache
        await this.localRepo.deleteFromCache(photo.id);
    } catch (e) {
        console.error('GalleryUseCase deletePhoto error:', e);
        throw e;
    }
  }
}
