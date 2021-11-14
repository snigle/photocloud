<template>
    <div>
<input type="file" @change="upload" multiple="multiple" />
    </div>
</template>
<script lang="ts">
import { ExifParserFactory } from 'ts-exif-parser'
import {Vue} from 'vue-class-component'
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache'
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI'
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift'
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer'
import { SwiftRepo } from '../../../pkg/repository/swift/photo'
import { SyncPhoto } from '../../../pkg/usecase/syncPhoto'

const photocloudConnector = NewPhotocloudConnector()
const cacheConnector = NewCacheConnector()
const swiftConnector = NewSwiftConnector()

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector)
const swiftRepo = new SwiftRepo(swiftConnector)

export default class extends Vue {

async upload(event: Event) {
    if (!event.target) {
        return
    }
    const target = (<HTMLInputElement>event.target);
    if (!target) {
        return
    }
    if (!target.files) {
        return
    }
    const files : FileList = target.files

    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file) {
            continue
        }
        const content = await file?.arrayBuffer()
        if (!content) {
            continue
        }

        const metadatas = ExifParserFactory.create(content).parse();
        // console.log("result", result);
        // result.
        const creationDate = metadatas.tags?.CreateDate ? new Date(metadatas.tags.CreateDate * 1000) : new Date();

        await new SyncPhoto(photocloudRepo, swiftRepo).syncPhoto({
        name: file?.name || '',
        creationDate,
        content: new Uint8Array(content),
        }) 
        console.log('upload done')
        
    }
    }
}
</script>