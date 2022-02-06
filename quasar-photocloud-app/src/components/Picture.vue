<template>
  <div class="col row justify-center" style="min-height: inherit">
    <img class="mainPicture" :src="this.photoRaw" />
  </div>
</template>

<script lang="ts">
import { Vue } from 'vue-class-component';
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache';
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI';
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer';
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift';
import { SwiftRepo } from '../../../pkg/repository/swift/photo';
import { UploadedPhoto } from '../../../pkg/domain/eUploadedPhoto';
import { GetPhoto } from '../../../pkg/usecase/getPhoto';
import { AndroidPhotoRepo } from '../../../pkg/repository/android/androidPhoto';

const photocloudConnector = NewPhotocloudConnector();
const cacheConnector = NewCacheConnector();
const swiftConnector = NewSwiftConnector();

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector);
const swiftRepo = new SwiftRepo(swiftConnector);
const androidRepo = new AndroidPhotoRepo(cacheConnector);

const getPhotoUseCase = new GetPhoto(photocloudRepo, swiftRepo, androidRepo);

class Props {
  readonly id!: string;
}

export default class Picture extends Vue.with(Props) {
  photo: UploadedPhoto | null = null;
  photoRaw = '';

  async mounted() {
    this.photo = await getPhotoUseCase.getPhoto(this.id);
    const content = await getPhotoUseCase.downloadCompress(this.photo);
    this.photoRaw = URL.createObjectURL(
      new Blob([content], { type: 'image/jpeg' })
    );
  }
}
</script>

<style lang="scss" scoped>
.mainPicture {
  display: block;
  width: auto;
  height: auto;
  max-height: 100%;
  max-width: 100%;
}
</style>