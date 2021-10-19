import { PhotoRaw } from "./vPhotoRaw";

export type LocalPhoto = {
    name: string
    creationDate: Date
    content: PhotoRaw
}

export interface ILocalPhoto {
    compress(file: LocalPhoto) : Promise<PhotoRaw>
    createThumbnail(file: LocalPhoto) : Promise<PhotoRaw>
}