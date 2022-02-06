import { /*FilesystemEncoding,*/ Plugins } from '@capacitor/core';

import { ExifParserFactory } from 'ts-exif-parser';

import { AndroidPhoto, IAndroidPhoto } from "../../domain/eAndroidPhoto"
import { ILocalPhoto, LocalPhoto } from '../../domain/eLocalPhoto';
import { PhotoRaw } from '../../domain/vPhotoRaw';
import { ICacheConnector } from "../connectors/cache"

export class CanvasRepo implements ILocalPhoto {
    constructor() { }
    compress(file: LocalPhoto): Promise<Uint8Array> {
        return this.resize(file.content, 4608, 3456)
    }
    createThumbnail(file: LocalPhoto): Promise<Uint8Array> {
        return this.resize(file.content, 200, 400)
    }

    resize(file: PhotoRaw, maxWidth: number, maxHeight: number): Promise<PhotoRaw> {
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

}