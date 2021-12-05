import { Customer } from "./vCustomer";
import { LocalPhoto } from "./eLocalPhoto";
import { PhotoRaw } from "./vPhotoRaw";
import { AuthenticatedCustomer } from "./eAuthenticatedCustomer";

export type UploadedPhoto = {
    id: string,
    localId: string,
    thumbnailURL: string,
    compressURL:string,
    originalURL:string,
}

export interface IUploadedPhoto {
    uploadOriginal(file: LocalPhoto, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>
    uploadThumbnail(file: LocalPhoto, thumbnail: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>
    uploadCompress(file: LocalPhoto, compress: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>
    listFromCustomer(customer: AuthenticatedCustomer) : Promise<UploadedPhoto[]>
    getThumbnail(customer: AuthenticatedCustomer, photo: UploadedPhoto) : Promise<PhotoRaw>
    getCompress(customer: AuthenticatedCustomer, photo: UploadedPhoto) : Promise<PhotoRaw>
    getFromID(customer: AuthenticatedCustomer, id: string) : Promise<UploadedPhoto>
}