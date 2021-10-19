import { UploadedPhoto } from "../domain/eUploadedPhoto"
import { PhotoRaw } from "../domain/vPhotoRaw"
import { PhotocloudAuthenticatedCustomer } from "../repository/photocloudAPI/authenticatedCustomer"
import { SwiftPhoto } from "../repository/swift/photo"

const PhotoRepo = SwiftPhoto

export async function getPhoto(photo: UploadedPhoto): Promise<PhotoRaw> {
    // Get customer
    const customer = await PhotocloudAuthenticatedCustomer.Get()

    // Check if file exist in cloud
    const file = await PhotoRepo.getThumbnail(customer, photo)
    return file
}