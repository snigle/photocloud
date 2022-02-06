<template>
  <div class="upload">
    <input
      type="file"
      @change="upload"
      multiple="multiple"
      :disabled="loading"
    />
  </div>
</template>
<script lang="ts">
import moment from 'moment';
import { Notify } from 'quasar';
import { ExifParserFactory } from 'ts-exif-parser';
import { Vue } from 'vue-class-component';
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache';
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI';
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift';
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer';
import { SwiftRepo } from '../../../pkg/repository/swift/photo';
// import { ImageMagick } from '../../../pkg/repository/imagemagick/imagemagick';
import { CanvasRepo } from '../../../pkg/repository/canvas/canvas';
import { SyncPhoto } from '../../../pkg/usecase/syncPhoto';

const photocloudConnector = NewPhotocloudConnector();
const cacheConnector = NewCacheConnector();
const swiftConnector = NewSwiftConnector();

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector);
const swiftRepo = new SwiftRepo(swiftConnector);
// const imageMagickRepo = new ImageMagick();
const canvaRepo = new CanvasRepo();

const syncUseCase = new SyncPhoto(photocloudRepo, swiftRepo, canvaRepo);

export default class extends Vue {
  loading = false;

  base64ToArrayBuffer(base64: string) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async upload(event: Event) {
    if (!event.target) {
      return;
    }
    const target = <HTMLInputElement>event.target;
    if (!target) {
      return;
    }
    if (!target.files) {
      return;
    }
    const files: FileList = target.files;

    const notification = Notify.create({
      message: 'Saving photos...',
      spinner: true,
      position: 'bottom-right',
      type: 'info',
      timeout: 0,
      group: false,
    });

    const durations: number[] = [];
    this.loading = true;
    for (let index = 0; index < files.length; index++) {
      const start = new Date().getTime();

      let caption = `${index + 1}/${files.length}`;
      if (durations.length) {
        const average =
          durations.reduce((d, agg) => d + agg, 0) / durations.length;
        const remaining = average * (files.length - index + 1);
        caption += ` (remaining : ${moment
          .duration({ milliseconds: remaining })
          .humanize()})`;
      }
      notification({
        caption,
      });

      const file = files[index];
      if (!file) {
        continue;
      }
      const content = await file?.arrayBuffer();
      if (!content) {
        continue;
      }

      const metadatas = ExifParserFactory.create(content).parse();
      const creationDate = metadatas.tags?.CreateDate
        ? new Date(metadatas.tags.CreateDate * 1000)
        : new Date();

      await syncUseCase.syncPhoto({
        name: file?.name || '',
        creationDate,
        content: new Uint8Array(content),
      });

      durations.push(new Date().getTime() - start);
    }

    notification({
      spinner: false,
      icon: 'done',
      timeout: 3000,
      caption: '',
      message: `${files.length} photos saved`,
      type: 'positive',
    });
    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
.upload {
  height: 20px;
}
</style>