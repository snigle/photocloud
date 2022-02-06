import { /*FilesystemEncoding,*/ Plugins, Device } from '@capacitor/core';

import { ExifParserFactory } from 'ts-exif-parser';

import { AndroidPhoto, IAndroidPhoto } from "../../domain/eAndroidPhoto"
import { PhotoRaw } from '../../domain/vPhotoRaw';
import { ICacheConnector } from "../connectors/cache"

export class AndroidPhotoRepo implements IAndroidPhoto {
    operatingSystem = ""

    constructor(private cacheConnector: ICacheConnector) { }

    async isAndroid(): Promise<boolean> {
        if (this.operatingSystem != "") {
            return this.operatingSystem == "android"
        }
        const info = await Device.getInfo()
        this.operatingSystem = info.operatingSystem
        return this.operatingSystem == "android"
    }

    generateThumbnail(file: PhotoRaw, maxWidth: number, maxHeight: number): Promise<PhotoRaw> {
        return new Promise((resolve, reject) => {
            var orig_src = new Image()
            orig_src.onload = function (imageEvent) {
                // Resize image
                const resize_canvas = document.createElement('canvas');
                var canvas = document.createElement('canvas'),
                    width = orig_src.width,
                    height = orig_src.height;
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject('fail to get canva context')
                    return;
                }
                ctx.drawImage(orig_src, 0, 0, width, height);
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        reject("fail to generate thumbnail")
                        return
                    }
                    const result = await blob.arrayBuffer()
                    resolve(new Uint8Array(result));
                }, 'image/jpeg', 0.8);
            }
            orig_src.src = URL.createObjectURL(new Blob([file], { type: 'image/jpeg' }));
        })
    }


    base64ToArrayBuffer(base64: string) {
        var binary_string = window.atob(base64);
        var len = binary_string.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async loadPhotosCache(limit: number): Promise<number> {
        const Filesystem = Plugins.Filesystem;
        const cache = this.cacheConnector.Connect()
        const loadedPhotos = await this.list()
        let loaded = 0
        try {
            const path = 'file:///mnt/ext_sdcard/DCIM/Camera';
            let ret = await Filesystem.readdir({
                path,
            });
            const files = ret.files.sort().reverse()
            console.log('read files', files.length)
            for (let i = 0; i < files.length && loaded < limit; i++) {
                let picture = files[i];
                if (loadedPhotos.find(p => p.name === picture && path === p.path)) {
                    // console.log('file already exist', picture, i)
                    continue
                }

                if (!picture.match(/\.(jpe?g|png)$/i)) {
                    console.log('ignore file type', picture, i)
                    continue
                }
                let stats = await Filesystem.stat({
                    path: `${path}/${picture}`,
                    // encoding: FilesystemEncoding.UTF8,
                });
                if (stats.size > 10 * 1024 * 1024) {
                    console.log('file to heavy', picture, stats.size, i)
                    continue
                }
                let response = await Filesystem.readFile({
                    path: `${path}/${picture}`,
                    // encoding: FilesystemEncoding.UTF8,
                });

                const content = this.base64ToArrayBuffer(response.data);

                const metadatas = ExifParserFactory.create(content).parse();
                var creationDate: Date | undefined;
                if (metadatas.tags?.CreateDate) {
                    creationDate = new Date(metadatas.tags.CreateDate * 1000);
                } else {
                    console.error('creation date not found, metadatas : ', metadatas)
                    throw `creation date of photo ${picture} not found`
                }


                loadedPhotos.push(new AndroidPhoto(picture, path, creationDate))
                loaded++
                console.log('loaded', loaded)
            }
        } catch (e) {
            throw `Unable to read dir: ${e}`
        }
        cache.setItem("android.photos", JSON.stringify(loadedPhotos));
        return loaded
    }

    list(): Promise<AndroidPhoto[]> {
        const cache = this.cacheConnector.Connect()
        const listString = cache.getItem("android.photos");
        if (!listString) {
            return Promise.resolve([])
        }
        const list: { [key: string]: string }[] = JSON.parse(listString)
        return Promise.resolve(list.map(o => new AndroidPhoto(o.name, o.path, new Date(o.creationDate))))
    }

    async getOriginal(photo: AndroidPhoto): Promise<Uint8Array> {
        const Filesystem = Plugins.Filesystem;

        let response = await Filesystem.readFile({
            path: `${photo.path}/${photo.name}`,
            // encoding: FilesystemEncoding.UTF8,
        });

        return this.generateThumbnail(new Uint8Array(this.base64ToArrayBuffer(response.data)), 400, 200);
        // return new Uint8Array(this.base64ToArrayBuffer(response.data));
    }


}