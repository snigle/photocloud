import { IS3Repository, ILocalGalleryRepository, S3Credentials, Photo } from '../domain/types';
import { SyncSettingsRepository } from '../infra/sync-settings.repository';
import { UploadUseCase } from './upload.usecase';

export class SyncPhotosUseCase {
  constructor(
    private s3Repo: IS3Repository,
    private localRepo: ILocalGalleryRepository,
    private syncSettingsRepo: SyncSettingsRepository
  ) {}

  async execute(creds: S3Credentials, email: string): Promise<number> {
    const settings = await this.syncSettingsRepo.getSettings();
    if (settings.enabledFolders.length === 0) return 0;

    const uploadedIds = await this.localRepo.getUploadedLocalIds();
    const uploadUseCase = new UploadUseCase(this.s3Repo, this.localRepo);

    let syncCount = 0;
    const MAX_SYNC = 100;

    for (const folderId of settings.enabledFolders) {
        if (syncCount >= MAX_SYNC) break;

        const photos = await this.localRepo.getPhotosByFolder(folderId, 500);
        for (const photo of photos) {
            if (syncCount >= MAX_SYNC) break;

            if (!uploadedIds.has(photo.id)) {
                try {
                    console.log(`Background sync: uploading ${photo.id}`);
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
                    }
                } catch (e) {
                    console.error(`Failed to sync photo ${photo.id}`, e);
                }
            }
        }
    }

    return syncCount;
  }
}
