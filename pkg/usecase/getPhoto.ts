import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer"
import { IUploadedPhoto, UploadedPhoto } from "../domain/eUploadedPhoto"
import { PhotoRaw } from "../domain/vPhotoRaw"

export class GetPhoto {

    constructor(private photocloudRepo: IAuthenticatedCustomer, private swiftRepo: IUploadedPhoto) { }

    async downloadThumbnail(photo: UploadedPhoto): Promise<PhotoRaw> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const file = await this.swiftRepo.getThumbnail(customer, photo)
        return file
    }

    async downloadCompress(photo: UploadedPhoto): Promise<PhotoRaw> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const file = await this.swiftRepo.getCompress(customer, photo)
        return file
    }

    async getPhoto(id: string): Promise<UploadedPhoto> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const photo = await this.swiftRepo.getFromID(customer, id)
        return photo
    }
    
}
