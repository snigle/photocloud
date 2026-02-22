import { GalleryUseCase } from "./gallery";
import { GalleryPhoto, IGalleryRepository } from "../domain/eGallery";
import { ILocalPhoto, LocalPhoto } from "../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../domain/eUploadedPhoto";
import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";
import { PhotoRaw } from "../domain/vPhotoRaw";
import { AuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";

class MockGalleryRepo implements IGalleryRepository {
    photos: GalleryPhoto[] = [];
    async savePhotos(photos: GalleryPhoto[]) { this.photos = photos; }
    async getPhotos(offset: number, limit: number) { return this.photos.slice(offset, offset + limit); }
    async getCount() { return this.photos.length; }
    async clear() { this.photos = []; }
}

class MockLocalPhotoRepo implements ILocalPhoto {
    async list() {
        const photos: LocalPhoto[] = [];
        for (let i = 0; i < 25000; i++) {
            photos.push({
                id: `local_${i}`,
                name: `photo_${i}.jpg`,
                creationDate: new Date(Date.now() - i * 1000000)
            });
        }
        return photos;
    }
    async compress(file: LocalPhoto): Promise<PhotoRaw> { return new Uint8Array(); }
    async createThumbnail(file: LocalPhoto): Promise<PhotoRaw> { return new Uint8Array(); }
}

class MockCloudPhotoRepo implements IUploadedPhoto {
    async listFromCustomer(customer: AuthenticatedCustomer) {
        const photos: UploadedPhoto[] = [];
        for (let i = 20000; i < 45000; i++) {
            photos.push({
                id: `cloud_${i}`,
                localId: `photo_${i}.jpg`,
                thumbnailURL: `thumb_${i}`,
                compressURL: `comp_${i}`,
                originalURL: `orig_${i}`,
                creationDate: new Date(Date.now() - i * 1000000)
            });
        }
        return photos;
    }
    async uploadOriginal(file: LocalPhoto, customer: AuthenticatedCustomer): Promise<UploadedPhoto> { throw "not implemented"; }
    async uploadThumbnail(file: LocalPhoto, thumbnail: PhotoRaw, customer: AuthenticatedCustomer): Promise<UploadedPhoto> { throw "not implemented"; }
    async uploadCompress(file: LocalPhoto, compress: PhotoRaw, customer: AuthenticatedCustomer): Promise<UploadedPhoto> { throw "not implemented"; }
    async getThumbnail(customer: AuthenticatedCustomer, photo: UploadedPhoto): Promise<PhotoRaw> { return new Uint8Array(); }
}

class MockAuthRepo implements IAuthenticatedCustomer {
    async Get() { return { customer: { id: "test" } } as any; }
    async Login(access_token: string) { return {} as any; }
    async Refresh(access_token: string) { return {} as any; }
    async Logout() { }
}

async function testGallery() {
    const galleryRepo = new MockGalleryRepo();
    const useCase = new GalleryUseCase(
        galleryRepo,
        new MockLocalPhotoRepo(),
        new MockCloudPhotoRepo(),
        new MockAuthRepo()
    );

    console.log("Starting sync of 45k photos...");
    const start = Date.now();
    await useCase.sync();
    const end = Date.now();
    console.log(`Sync took ${end - start}ms`);

    const count = await galleryRepo.getCount();
    console.log(`Total photos in gallery: ${count}`);
    if (count !== 45000) throw `Expected 45000 photos, got ${count}`;

    console.log("Testing lazy loading...");
    const startLoad = Date.now();
    const photos = await useCase.getPhotos(1000, 100);
    const endLoad = Date.now();
    console.log(`Loading 100 photos at offset 1000 took ${endLoad - startLoad}ms`);

    if (photos.length !== 100) throw `Expected 100 photos, got ${photos.length}`;

    // Check merging: photo_20000 should be in both
    const allPhotos = await galleryRepo.getPhotos(0, 45000);
    const photo20k = allPhotos.find(p => p.id === "photo_20000.jpg");
    if (!photo20k?.localPhoto || !photo20k?.cloudPhoto) {
        throw `Expected photo_20000.jpg to have both local and cloud data`;
    }
    console.log("Merging verified for photo_20000.jpg");

    console.log("Test passed!");
}

testGallery().catch((err) => {
    console.error(err);
});
