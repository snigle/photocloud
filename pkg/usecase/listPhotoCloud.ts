import { Customer } from "../domain/vCustomer";
import { LocalPhoto } from "../domain/eLocalPhoto";
import { UploadedPhoto } from "../domain/eUploadedPhoto";
import { Plan } from "../domain/vPlan";
import { ImageMagick } from "../repository/imagemagick/imagemagick";
import { PhotocloudAuthenticatedCustomer } from "../repository/photocloudAPI/authenticatedCustomer";
import { SwiftPhoto } from "../repository/swift/photo";

const PhotoRepo = SwiftPhoto

export async function listPhotoCloud(): Promise<UploadedPhoto[]> {
    // Get customer
    const customer = await PhotocloudAuthenticatedCustomer.Get()

    // Check if file exist in cloud
    const files = await PhotoRepo.listFromCustomer(customer)
    return files
}