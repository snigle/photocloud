import { ILocalPhoto, LocalPhoto } from "../../domain/eLocalPhoto";
import { PhotoRaw } from "../../domain/vPhotoRaw";
import { call } from './magickApi';


async function compress(file: LocalPhoto) : Promise<PhotoRaw> {
    if (!file.content) {
        throw `trying to compress empty photo named ${file.name}`
    }
    const sanitizedName = file.name.replace(" ", "")
    const cmd = `convert ${sanitizedName} -sampling-factor 4:2:0 -strip -quality 85 -interlace JPEG -define jpeg:extent=900kb -colorspace RGB -resize 4608x3456 compress.jpg`
    const result = await call([{name: file.name, content: file.content}], cmd.split(" "))

    if(result.exitCode !== 0) {
        throw `Fail to compress image ${file.name} with command "${cmd}" : ` + result.stderr.join('\n')
    }

    if (!result.outputFiles[0].buffer) {
        throw `Fail to compress image, output buffer is empty.\nfilename: ${file.name}\ncmd: ${cmd}`
    }
    return new Uint8Array(result.outputFiles[0].buffer)
}

async function createThumbnail(file: LocalPhoto) : Promise<PhotoRaw> {
    if (!file.content) {
        throw `trying to compress empty photo named ${file.name}`
    }
    const sanitizedName = file.name.replace(" ", "")
    const cmd = `convert ${sanitizedName} -sampling-factor 4:2:0 -strip -quality 85 -interlace JPEG -colorspace RGB -resize 400x200 thumb.jpg`
    const result = await call([{name: file.name, content: file.content}], cmd.split(" "))

    if(result.exitCode !== 0) {
        throw `Fail to compress image ${file.name} with command "${cmd}" : ` + result.stderr.join('\n')
    }

    if (!result.outputFiles[0].buffer) {
        throw `Fail to compress image, output buffer is empty.\nfilename: ${file.name}\ncmd: ${cmd}`
    }
    return new Uint8Array(result.outputFiles[0].buffer)
}

export const ImageMagick: ILocalPhoto = {
    compress,
    createThumbnail,
}