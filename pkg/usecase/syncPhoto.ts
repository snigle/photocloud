import { Customer } from "../domain/vCustomer";
import { LocalPhoto } from "../domain/eLocalPhoto";
import { Plan } from "../domain/vPlan";
import { ImageMagick } from "../repository/imagemagick/imagemagick";
import { PhotocloudAuthenticatedCustomer } from "../repository/photocloudAPI/authenticatedCustomer";
import { SwiftPhoto } from "../repository/swift/photo";

const PhotoRepo = SwiftPhoto

export async function syncPhoto(file: LocalPhoto): Promise<void> {
    // Get customer
    const customer = await PhotocloudAuthenticatedCustomer.Get()

    // Check if file exist in cloud
    const files = await PhotoRepo.listFromCustomer(customer)
    if (files.find((f) => {
        return f.localId === file.name
    })) {
        return;
    }

    // Create thumbnail
    const thumbPromise = ImageMagick.createThumbnail(file)
    .then((thumbnail) => PhotoRepo.uploadThumbnail(file, thumbnail, customer))
    // Create compress
    const compressPromise = ImageMagick.compress(file)
    .then((compress) => PhotoRepo.uploadCompress(file, compress, customer))

    // If subscription plan paid && customer configuration store Original
    if (customer.subscription.plan != Plan.free) {
        await PhotoRepo.uploadOriginal(file, customer)
    }
    await thumbPromise;
    await compressPromise;
    return 
}