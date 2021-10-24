import { Customer } from "../../domain/vCustomer";
import { LocalPhoto } from "../../domain/eLocalPhoto";
import { IUploadedPhoto, UploadedPhoto } from "../../domain/eUploadedPhoto";
import { PhotoRaw } from "../../domain/vPhotoRaw";
import { Object } from "../../lib/swiftsdk/swiftsdk";
import { ISwiftConnector } from "../connectors/swift";
import { AuthenticatedCustomer } from "../../domain/eAuthenticatedCustomer";

const compressPrefix = `/compress/`;
const thumbnailPrefix = `/thumbnail/`;
const originalPrefix = `/original/`;

export class SwiftRepo implements IUploadedPhoto {
    constructor(private swiftConnector: ISwiftConnector){}

    private formatSwiftFileName(prefix: string, file: LocalPhoto): string {
        return `${prefix}${file.creationDate.getTime()/1000}-${file.name}`
    }
    private parseSwiftFileName(prefix: string, swiftName: string): string {
        return swiftName.replace(prefix, "").replace(/^\d+-/,"")
    }

    async uploadOriginal(file: LocalPhoto, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
        const swift = await this.swiftConnector.Connect(customer.swiftCredentials);
        const prefix = `/${customer.customer.id}${originalPrefix}`;
        const body = file.content
        const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, this.formatSwiftFileName(prefix, file), body, "image/jpeg")
        return this.toDomain(prefix, object)
    }
    
    async uploadThumbnail(file: LocalPhoto, thumbnail: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
        const swift = await this.swiftConnector.Connect(customer.swiftCredentials);
        const prefix = `/${customer.customer.id}${thumbnailPrefix}`;
        const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, this.formatSwiftFileName(prefix, file), thumbnail, "image/jpeg")
        return this.toDomain(prefix, object)
    }
    
    async uploadCompress(file: LocalPhoto, compress: PhotoRaw, customer: AuthenticatedCustomer) : Promise<UploadedPhoto>{
        const swift = await this.swiftConnector.Connect(customer.swiftCredentials);
        const prefix = `/${customer.customer.id}${compressPrefix}`;
        const object = await swift.putObject(customer.swiftCredentials.region, customer.swiftCredentials.container, this.formatSwiftFileName(prefix, file), compress, "image/jpeg")
        return this.toDomain(prefix, object)
    }
    
    
    
    async listFromCustomer(customer: AuthenticatedCustomer) : Promise<UploadedPhoto[]>{
        const client = await this.swiftConnector.Connect(customer.swiftCredentials)
        const customerPrefix = `/${customer.customer.id}${compressPrefix}`;
        
        const container = await client.listObjects(customer.swiftCredentials.region, customer.swiftCredentials.container, {prefix: customerPrefix})
        if (!container.objects) {
            return []
        }
        return container.objects.map(object => this.toDomain(customerPrefix, object))
    }
    
    async getThumbnail(customer: AuthenticatedCustomer, photo: UploadedPhoto) : Promise<PhotoRaw> {
        const client = await this.swiftConnector.Connect(customer.swiftCredentials)
        const raw = await client.getObject(customer.swiftCredentials.region, customer.swiftCredentials.container, photo.thumbnailURL)
        return raw
    }
    
    
     toDomain(customerPrefix: string, object: Object): UploadedPhoto {
        return {
            id: object.name,
            localId: this.parseSwiftFileName(customerPrefix, object.name),
            compressURL: object.name,
            thumbnailURL: object.name.replace(compressPrefix, thumbnailPrefix),
            originalURL: object.name.replace(compressPrefix, originalPrefix),
        }
    }
}

