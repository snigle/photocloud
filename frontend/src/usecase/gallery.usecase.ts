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
        const cloud = await this.s3Repo.listPhotos(creds.bucket, `users/${email}/`);

        // Merge and sort
        const all = [...local, ...cloud].sort((a, b) => b.creationDate - a.creationDate);

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
}
