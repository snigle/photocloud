import { UploadedPhoto } from "./eUploadedPhoto";
import { LocalPhoto } from "./eLocalPhoto";

export type GalleryPhoto = {
    id: string; // unique id for the gallery
    localPhoto?: LocalPhoto;
    cloudPhoto?: UploadedPhoto;
    date: Date;
}

export interface IGalleryRepository {
    savePhotos(photos: GalleryPhoto[]): Promise<void>;
    getPhotos(offset: number, limit: number): Promise<GalleryPhoto[]>;
    getCount(): Promise<number>;
    clear(): Promise<void>;
}
