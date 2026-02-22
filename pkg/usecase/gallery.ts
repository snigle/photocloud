import { IGalleryRepository, GalleryPhoto } from "../domain/eGallery";
import { ILocalPhoto, LocalPhoto } from "../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../domain/eUploadedPhoto";
import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";

export class GalleryUseCase {
    constructor(
        private galleryRepo: IGalleryRepository,
        private localPhotoRepo: ILocalPhoto,
        private cloudPhotoRepo: IUploadedPhoto,
        private authCustomerRepo: IAuthenticatedCustomer
    ) {}

    /**
     * getPhotos returns a slice of the gallery for lazy loading.
     */
    async getPhotos(offset: number, limit: number): Promise<GalleryPhoto[]> {
        return this.galleryRepo.getPhotos(offset, limit);
    }

    /**
     * sync merges local and cloud photos and updates the local index.
     */
    async sync(): Promise<void> {
        try {
            const customer = await this.authCustomerRepo.Get();

            // Fetch both in parallel
            const [localPhotos, cloudPhotos] = await Promise.all([
                this.localPhotoRepo.list(),
                this.cloudPhotoRepo.listFromCustomer(customer)
            ]);

            const mergedPhotos: Map<string, GalleryPhoto> = new Map();

            // Process local photos
            for (const local of localPhotos) {
                mergedPhotos.set(local.name, {
                    id: local.name,
                    localPhoto: local,
                    date: local.creationDate
                });
            }

            // Process cloud photos
            for (const cloud of cloudPhotos) {
                const existing = mergedPhotos.get(cloud.localId);
                if (existing) {
                    existing.cloudPhoto = cloud;
                } else {
                    mergedPhotos.set(cloud.localId, {
                        id: cloud.localId,
                        cloudPhoto: cloud,
                        date: cloud.creationDate
                    });
                }
            }

            // Sort by date descending
            const sortedPhotos = Array.from(mergedPhotos.values()).sort((a, b) => b.date.getTime() - a.date.getTime());

            // Update repository with the new sorted list
            await this.galleryRepo.savePhotos(sortedPhotos);
        } catch (e) {
            console.error("Gallery sync failed:", e);
            throw e;
        }
    }
}
