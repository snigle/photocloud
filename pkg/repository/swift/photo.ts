import { Customer } from "../../domain/vCustomer";
import { LocalPhoto } from "../../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../../domain/eUploadedPhoto";
import { PhotoRaw } from "../../domain/vPhotoRaw";
import { Object } from "../../lib/swiftsdk/swiftsdk";
import { SwiftConnector } from "../connectors/swift";
import { AuthenticatedCustomer } from "../../domain/eAuthenticatedCustomer";

const compressPrefix = `/compress/`;
const thumbnailPrefix = `/thumbnail/`;
const originalPrefix = `/original/`;

async function uploadOriginal(file: LocalPhoto, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
    const swift = await SwiftConnector.Connect(customer.swiftCredentials);
    const prefix = `/${customer.customer.id}${originalPrefix}`;
    const body = file.content
    const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, body, "image/jpeg")
    return toDomain(prefix, object)
}

async function uploadThumbnail(file: LocalPhoto, thumbnail: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
    const swift = await SwiftConnector.Connect(customer.swiftCredentials);
    const prefix = `/${customer.customer.id}${thumbnailPrefix}`;
    const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, thumbnail, "image/jpeg")
    return toDomain(prefix, object)
}

async function uploadCompress(file: LocalPhoto, compress: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
    const swift = await SwiftConnector.Connect(customer.swiftCredentials);
    const prefix = `/${customer.customer.id}${compressPrefix}`;
    const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, compress, "image/jpeg")
    return toDomain(prefix, object)
}



async function listFromCustomer(customer: AuthenticatedCustomer) : Promise<UploadedPhoto[]>{
    const client = await SwiftConnector.Connect(customer.swiftCredentials)
    const customerPrefix = `/${customer.customer.id}${compressPrefix}`;
    
    const container = await client.listObjects(customer.swiftCredentials.region, customer.swiftCredentials.container, {prefix: customerPrefix})
    if (!container.objects) {
        return []
    }
    return container.objects.map(object => toDomain(customerPrefix, object))
}

async function getThumbnail(customer: AuthenticatedCustomer, photo: UploadedPhoto) : Promise<PhotoRaw> {
    const client = await SwiftConnector.Connect(customer.swiftCredentials)
    const raw = await client.getObject(customer.swiftCredentials.region, customer.swiftCredentials.container, photo.thumbnailURL)
    return raw
}


function toDomain(customerPrefix: string, object: Object): UploadedPhoto {
    return {
        id: object.name,
        localId: object.name.replace(customerPrefix, ""),
        compressURL: object.name,
        thumbnailURL: object.name.replace(compressPrefix, thumbnailPrefix),
        originalURL: object.name.replace(compressPrefix, originalPrefix),
    }
}

export const SwiftPhoto: IUploadedPhoto = {
    listFromCustomer,
    uploadCompress,
    uploadOriginal,
    uploadThumbnail,
    getThumbnail,
}