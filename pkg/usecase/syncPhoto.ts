import { Customer } from "../domain/vCustomer";
import { ILocalPhoto, LocalPhoto } from "../domain/eLocalPhoto";
import { Plan } from "../domain/vPlan";
import { ImageMagick } from "../repository/imagemagick/imagemagick";
import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";
import { IUploadedPhoto } from "../domain/eUploadedPhoto";

export class SyncPhoto {

    constructor(private photocloudRepo: IAuthenticatedCustomer, private uploadPhotoRepo: IUploadedPhoto, private localPhotoRepo: ILocalPhoto) { }

    async syncPhoto(file: LocalPhoto): Promise<void> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const files = await this.uploadPhotoRepo.listFromCustomer(customer)
        if (files.find((f) => {
            return f.localId === file.name
        })) {
            console.log("file already post")
            return;
        }

        console.log("start upload")

        // Create thumbnail
        const thumbPromise = this.localPhotoRepo.createThumbnail(file)
            .then((thumbnail) => this.uploadPhotoRepo.uploadThumbnail(file, thumbnail, customer))
        // Create compress
        const compressPromise = this.localPhotoRepo.compress(file)
            .then((compress) => this.uploadPhotoRepo.uploadCompress(file, compress, customer))

        // If subscription plan paid && customer configuration store Original
        if (customer.subscription.plan != Plan.free) {
            await this.uploadPhotoRepo.uploadOriginal(file, customer)
        }
        await thumbPromise;
        await compressPromise;
        return
    }
}