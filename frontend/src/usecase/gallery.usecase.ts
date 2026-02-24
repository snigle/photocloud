import { IS3Repository, ILocalGalleryRepository, Photo, S3Credentials } from '../domain/types';
import { decodeText, encodeText } from '../infra/utils';

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

        // Update index counts based on actual cloud photos found
        await this.reindexCloud(creds, email, cloud);
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

  async getCloudIndex(creds: S3Credentials, email: string): Promise<{ years: { year: string, count: number }[] }> {
      return await this.s3Repo.getCloudIndex(creds.bucket, email);
  }

  private static indexLock: Promise<void> = Promise.resolve();

  private async updateIndexCount(creds: S3Credentials, email: string, year: string, delta: number): Promise<void> {
      await GalleryUseCase.indexLock;
      let resolveLock: () => void;
      GalleryUseCase.indexLock = new Promise(resolve => { resolveLock = resolve; });

      try {
          const indexKey = `users/${email}/index.json`;
          const exists = await this.s3Repo.exists(creds.bucket, indexKey);
          if (!exists) return;

          const indexData = await this.s3Repo.getFile(creds.bucket, indexKey);
          const index = JSON.parse(decodeText(indexData));

          index.years = index.years.map((y: any) => {
              if (typeof y === 'string') return { year: y, count: 0 };
              return y;
          });

          let yearEntry = index.years.find((y: any) => y.year === year);
          if (yearEntry) {
              yearEntry.count = Math.max(0, yearEntry.count + delta);
              await this.s3Repo.uploadFile(
                  creds.bucket,
                  indexKey,
                  encodeText(JSON.stringify(index)),
                  'application/json'
              );
          }
      } catch (e) {
          console.error('Failed to update index count', e);
      } finally {
          resolveLock!();
      }
  }

  private async reindexCloud(creds: S3Credentials, email: string, cloudPhotos: Photo[]): Promise<void> {
      await GalleryUseCase.indexLock;
      let resolveLock: () => void;
      GalleryUseCase.indexLock = new Promise(resolve => { resolveLock = resolve; });

      try {
          const countsByYear: Record<string, number> = {};
          for (const p of cloudPhotos) {
              const year = new Date(p.creationDate * 1000).getFullYear().toString();
              countsByYear[year] = (countsByYear[year] || 0) + 1;
          }

          const indexKey = `users/${email}/index.json`;
          const index = {
              years: Object.entries(countsByYear)
                  .map(([year, count]) => ({ year, count }))
                  .sort((a, b) => b.year.localeCompare(a.year))
          };

          await this.s3Repo.uploadFile(
              creds.bucket,
              indexKey,
              encodeText(JSON.stringify(index)),
              'application/json'
          );
      } catch (e) {
          console.error('Failed to reindex cloud', e);
      } finally {
          resolveLock!();
      }
  }

  async deletePhoto(creds: S3Credentials, photo: Photo): Promise<void> {
    try {
        if (photo.type === 'cloud') {
            const date = new Date(photo.creationDate * 1000);
            const year = date.getFullYear().toString();
            const email = photo.key.split('/')[1]; // users/{email}/{year}/...

            // Decrement count in index
            await this.updateIndexCount(creds, email, year, -1);

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
