import { Customer } from "../domain/vCustomer";
import { LocalPhoto } from "../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../domain/eUploadedPhoto";
import { Plan } from "../domain/vPlan";
import { ImageMagick } from "../repository/imagemagick/imagemagick";
import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";

export class ListPhoto {

    constructor(private photocloudRepo: IAuthenticatedCustomer, private swiftRepo: IUploadedPhoto) { }

    async listPhotoCloud(): Promise<UploadedPhoto[]> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const files = await this.swiftRepo.listFromCustomer(customer)
        return files
    }

}