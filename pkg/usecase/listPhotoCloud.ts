import { Customer } from "../domain/vCustomer";
import { LocalPhoto } from "../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../domain/eUploadedPhoto";
import { Plan } from "../domain/vPlan";
import { ImageMagick } from "../repository/imagemagick/imagemagick";
import { IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";
import { AndroidPhoto, IAndroidPhoto } from "../domain/eAndroidPhoto";

export class ListPhoto {

    constructor(private photocloudRepo: IAuthenticatedCustomer, private swiftRepo: IUploadedPhoto, private androidRepo: IAndroidPhoto) { }

    async listPhotoCloud(): Promise<UploadedPhoto[]> {
        // Get customer
        const customer = await this.photocloudRepo.Get()

        // Check if file exist in cloud
        const files = await this.swiftRepo.listFromCustomer(customer)
        return files
    }

    async listPhotoAndroid(): Promise<AndroidPhoto[]> {
        if (!await this.androidRepo.isAndroid()) {
            return []
        }
        return await this.androidRepo.list()
    }

    async loadPhotosCache(limit: number): Promise<number> {
        if (!await this.androidRepo.isAndroid()) {
            return 0
        }
        return await this.androidRepo.loadPhotosCache(limit)
    }
}