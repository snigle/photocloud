import { PhotoRaw } from "./vPhotoRaw";

export type LocalPhoto = {
    id: string
    name: string
    creationDate: Date
    content?: PhotoRaw
    size?: number
    width?: number
    height?: number
}

export interface ILocalPhoto {
    list() : Promise<LocalPhoto[]>
    compress(file: LocalPhoto) : Promise<PhotoRaw>
    createThumbnail(file: LocalPhoto) : Promise<PhotoRaw>
}
