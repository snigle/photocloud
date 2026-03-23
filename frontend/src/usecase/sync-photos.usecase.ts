import { IS3Repository, ILocalGalleryRepository, S3Credentials, Photo } from '../domain/types';
import { SyncSettingsRepository } from '../infra/sync-settings.repository';
import { UploadUseCase } from './upload.usecase';

export class SyncPhotosUseCase {
  constructor(
    private s3Repo: IS3Repository,
    private localRepo: ILocalGalleryRepository,
    private syncSettingsRepo: SyncSettingsRepository
  ) {}

  async execute(
      creds: S3Credentials,
      email: string,
      onProgress?: (synced: number, total: number) => void,
      stopOnMax: boolean = true
  ): Promise<number> {
    const settings = await this.syncSettingsRepo.getSettings();
    if (settings.enabledFolders.length === 0) return 0;

    const uploadedIds = await this.localRepo.getUploadedLocalIds();
    const uploadUseCase = new UploadUseCase(this.s3Repo, this.localRepo);

    // 1. Calculate total and identify photos to sync
    let allPhotosToSync: any[] = [];
    let totalInFolders = 0;

    for (const folderId of settings.enabledFolders) {
        const photos = await this.localRepo.getPhotosByFolder(folderId, 10000); // Fetch more for calculation
        totalInFolders += photos.length;
        for (const photo of photos) {
            if (!uploadedIds.has(photo.id)) {
                allPhotosToSync.push(photo);
            }
        }
    }

    const totalToSync = allPhotosToSync.length;
    const alreadySynced = totalInFolders - totalToSync;

    if (onProgress) {
        onProgress(alreadySynced, totalInFolders);
    }

    let syncCount = 0;
    const MAX_SYNC = 100;

    for (const photo of allPhotosToSync) {
        if (stopOnMax && syncCount >= MAX_SYNC) break;

        try {
            console.log(`Syncing: uploading ${photo.id}`);
            const uploaded = await uploadUseCase.execute(
                photo.uri,
                `sync-${photo.id}.jpg`,
                creds,
                email,
                false,
                photo.id,
                photo.creationDate
            );
            if (uploaded) {
                syncCount++;
                if (onProgress) {
                    onProgress(alreadySynced + syncCount, totalInFolders);
                }
            }
        } catch (e) {
            console.error(`Failed to sync photo ${photo.id}`, e);
        }
    }

    return syncCount;
  }
}
