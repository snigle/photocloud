import { Customer } from "../../domain/vCustomer";
import { LocalPhoto } from "../../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../../domain/eUploadedPhoto";
import { PhotoRaw } from "../../domain/vPhotoRaw";
import { s3Connector } from "../connectors/s3";
import { AuthenticatedCustomer } from "../../domain/eAuthenticatedCustomer";

async function uploadOriginal(file: LocalPhoto,customer: AuthenticatedCustomer) : Promise<UploadedPhoto> {
    const s3 = await s3Connector.Connect(customer.s3Credentials);
    const prefix = `/${customer.customer.id}${originalPrefix}`;
    const body = file.content
    const object = await s3.putObject({Bucket: bucketName, Key: `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, Body: body}).promise()
    return toDomain(prefix, object)
}

async function uploadThumbnail(file: LocalPhoto, thumbnail:PhotoRaw,customer: AuthenticatedCustomer) : Promise<UploadedPhoto> {
    const s3 = await s3Connector.Connect(customer.s3Credentials);
    const prefix = `/${customer.customer.id}${thumbnail}`;
    const body = file.content
    const object = await s3.putObject({Bucket: bucketName, Key: `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, Body: body}).promise()
    return toDomain(prefix, object)
}

async function uploadCompress(file: LocalPhoto, compress:PhotoRaw,customer: AuthenticatedCustomer) : Promise<UploadedPhoto> {
    const s3 = await s3Connector.Connect(customer.s3Credentials);
    const prefix = `/${customer.customer.id}${compressPrefix}`;
    const body = file.content
    const object = await s3.putObject({Bucket: bucketName, Key: `${prefix}${file.creationDate.getTime()/1000}-${file.name}`, Body: body}).promise()
    return toDomain(prefix, object)
}

const compressPrefix = `/compress/`;
const thumbnailPrefix = `/thumbnail/`;
const originalPrefix = `/original/`;
const bucketName = "photocloud";

async function listFromCustomer(customer: AuthenticatedCustomer) : Promise<UploadedPhoto[]> {
    const s3 = await s3Connector.Connect(customer.s3Credentials);
    const customerPrefix = `/${customer.customer.id}${compressPrefix}`;
    
    const objectList = await s3.listObjectsV2({Bucket: bucketName, Prefix: customerPrefix}).promise()
    if (!objectList.Contents) {
        return []
    }
    return objectList.Contents.map(s3Object => toDomain(customerPrefix, s3Object))
}

function toDomain(customerPrefix: string, s3Object: AWS.S3.Object): UploadedPhoto {
    if (!s3Object.Key) {
        throw `found object without key`
    }
    return {
        id: s3Object.Key,
        localId: s3Object.Key?.replace(customerPrefix, ""),
        compressURL: s3Object.Key,
        thumbnailURL: s3Object.Key.replace(compressPrefix, thumbnailPrefix),
        originalURL: s3Object.Key.replace(compressPrefix, originalPrefix),
    }
}

// export const S3Photo: IUploadedPhoto = {
//     listFromCustomer,
//     uploadCompress,
//     uploadOriginal,
//     uploadThumbnail,
// }