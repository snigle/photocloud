import { PhotoRaw } from "./vPhotoRaw";
import { LocalPhoto } from "./eLocalPhoto";

export class AndroidPhoto {

    constructor(
        public name: string,
        public path: string,
        public creationDate: Date,
    ) { }

    toLocalPhoto(file: AndroidPhoto, content: PhotoRaw): LocalPhoto {
        return {
            content,
            creationDate: this.creationDate,
            name: this.name,
        }
    }
}



export interface IAndroidPhoto {
    isAndroid(): Promise<boolean>
    loadPhotosCache(limit: number): Promise<number>
    list(): Promise<AndroidPhoto[]>
    getOriginal(photo: AndroidPhoto): Promise<PhotoRaw>
}