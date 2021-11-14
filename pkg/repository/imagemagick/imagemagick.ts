import { ILocalPhoto, LocalPhoto } from "../../domain/eLocalPhoto";
import { PhotoRaw } from "../../domain/vPhotoRaw";
import { call } from './magickApi';


async function compress(file: LocalPhoto) : Promise<PhotoRaw> {
    if (!file.content) {
        throw `trying to compress empty photo named ${file.name}`
    }
    const sanitizedName = sanitize(file.name)
    const cmd = `convert ${sanitizedName} -sampling-factor 4:2:0 -strip -quality 85 -interlace JPEG -define jpeg:extent=900kb -colorspace RGB -resize 4608x3456 compress.jpg`
    const result = await call([{name: sanitizedName, content: file.content}], cmd.split(" "))

    if(result.exitCode !== 0) {
        throw `Fail to compress image ${sanitizedName} with command "${cmd}" : ` + result.stderr.join('\n')
    }

    if (!result.outputFiles[0].buffer && !result.outputFiles[0].blob) {
        throw `Fail to compress image, output buffer is empty.\nfilename: ${sanitizedName}\ncmd: ${cmd}`
    }
    const buffer = result.outputFiles[0].buffer ? result.outputFiles[0].buffer: await result.outputFiles[0].blob.arrayBuffer()
    return new Uint8Array(buffer)
}

function sanitize(fileName: string): string {
    return fileName.replace(/ /g, "").replace(/(\(|\))/g,"")
}

async function createThumbnail(file: LocalPhoto) : Promise<PhotoRaw> {
    if (!file.content) {
        throw `trying to compress empty photo named ${file.name}`
    }
    const sanitizedName = sanitize(file.name)
    const cmd = `convert ${sanitizedName} -sampling-factor 4:2:0 -strip -quality 85 -interlace JPEG -colorspace RGB -resize 400x200 thumb.jpg`
    console.log("start thumb")
    const result = await call([{name: sanitizedName, content: file.content}], cmd.split(" "))
    console.log("thumb ok")
    if(result.exitCode !== 0) {
        throw `Fail to compress image ${sanitizedName} with command "${cmd}" : ` + result.stderr.join('\n')
    }

    if (!result.outputFiles[0].buffer && !result.outputFiles[0].blob) {
        console.log("result", result)
        throw `Fail to compress image, output buffer is empty.\nfilename: ${sanitizedName}\ncmd: ${cmd}`
    }
    const buffer = result.outputFiles[0].buffer ? result.outputFiles[0].buffer: await result.outputFiles[0].blob.arrayBuffer()
    return new Uint8Array(buffer)
}

export const ImageMagick: ILocalPhoto = {
    compress,
    createThumbnail,
}