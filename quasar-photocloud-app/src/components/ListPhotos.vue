<template>
  <div class="row justify-evenly" ref="htmlContainer">
    <div
      v-for="photo in photos"
      :key="photo.id"
      class="photo"
      style="height: 200px; overflow: hidden"
    >
      <div
        v-if="!links[photo.id]"
        style="width: 300px; height: 200px; background-color: red"
      ></div>
      <router-link v-else :to="{ name: 'picture', params: { id: photo.id } }">
        <img :src="links[photo.id]" :alt="photo.localId" />
      </router-link>
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, prop } from 'vue-class-component';
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache';
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI';
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer';
import { ListPhoto } from '../../../pkg/usecase/listPhotoCloud';
import { Todo, Meta } from './models';
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift';
import { SwiftRepo } from '../../../pkg/repository/swift/photo';
import { UploadedPhoto } from '../../../pkg/domain/eUploadedPhoto';
import { GetPhoto } from '../../../pkg/usecase/getPhoto';
import { AndroidPhotoRepo } from '../../../pkg/repository/android/androidPhoto';
import * as _ from 'lodash';
import { AndroidPhoto } from '../../../pkg/domain/eAndroidPhoto';

const photocloudConnector = NewPhotocloudConnector();
const cacheConnector = NewCacheConnector();
const swiftConnector = NewSwiftConnector();

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector);
const swiftRepo = new SwiftRepo(swiftConnector);
const androidRepo = new AndroidPhotoRepo(cacheConnector);

const listUseCase = new ListPhoto(photocloudRepo, swiftRepo, androidRepo);
const getUseCase: GetPhoto = new GetPhoto(
  photocloudRepo,
  swiftRepo,
  androidRepo
);

class Props {
  readonly title!: string;
  readonly todos = prop<Todo[]>({ default: () => [] });
  readonly meta!: Meta;
  readonly active!: boolean;
}

type Photo = {
  id: string;
  name: string;
  type: 'android' | 'cloud';
  index: number;
};

export default class ListPhotos extends Vue.with(Props) {
  isUnmounted = false;
  cloudPhotos: UploadedPhoto[] = [];
  androidPhotos: AndroidPhoto[] = [];
  linksLoading: { [key: string]: boolean } = {};
  links: { [key: string]: string } = {};

  htmlContainer: HTMLElement | null = null;

  unmounted() {
    this.isUnmounted = true;
  }

  get photos(): Photo[] {
    // console.log('getphotos2');
    let res: Photo[] = this.androidPhotos.map(
      (p, i): Photo => ({
        id: `${p.creationDate.getTime() / 1000}-${p.name}`,
        name: p.name,
        type: 'android',
        index: i,
      })
    );
    res = res.concat(
      ...this.cloudPhotos
        .map(
          (p, i): Photo => ({
            id: p.id,
            name: p.localId,
            type: 'cloud',
            index: i,
          })
        )
        .filter((p) => !res.find((r) => r.id === p.id))
    );

    res.sort((a, b) => {
      if (a.id > b.id) {
        return -1;
      }
      if (a.id < b.id) {
        return 1;
      }
      return 0;
    });
    return res;
  }

  pictureToLoadStack: Photo[] = [];

  async loadPhotoStack() {
    const promises: Promise<void>[] = [];
    let pictureToLoad: Photo | undefined;
    for (let i = 0; i < 5; i++) {
      pictureToLoad = this.pictureToLoadStack.shift();
      if (pictureToLoad) {
        promises.push(this.loadPhoto(pictureToLoad));
      }
      if (this.isUnmounted) {
        return;
      }
    }
    try {
      await Promise.all(promises);
    } catch (e) {
      // ignore error to keep stack shift
    }

    setTimeout(() => {
      void this.loadPhotoStack();
    }, 1);
  }

  selectPictureToDisplayDebounce = _.debounce(
    () => this.selectPictureToDisplay(),
    200
  );

  selectPictureToDisplay(): void {
    // console.log('selectPictureToDisplay');
    this.pictureToLoadStack = [];
    const document = window.document;
    const photos = this.photos; // As the method is called in _.debounce function, this computed value is always recomputed./
    if (!this.htmlContainer) {
      // console.log('no html container');
      return;
    }
    // console.log(
    //   'this.htmlContainer.children.length',
    //   this.htmlContainer.children.length
    // );
    for (let i = 0; i < this.htmlContainer.children.length; i++) {
      const item = this.htmlContainer.children.item(i);
      if (!item) {
        // console.log('empty item');
        continue;
      }
      const rect = item.getBoundingClientRect();
      const visible =
        rect.top <=
          (window.innerHeight || document.documentElement.clientHeight) &&
        rect.left <=
          (window.innerWidth || document.documentElement.clientWidth) &&
        rect.bottom >= 0 &&
        rect.right >= 0;

      if (visible) {
        for (let j = i; j < i + 5 && j < photos.length; j++) {
          this.pictureToLoadStack.push(photos[j]);
        }
        for (let j = i - 2; j < i && j < photos.length; j++) {
          this.pictureToLoadStack.push(photos[j]);
        }
        for (let j = i + 5; j < i + 20 && j < photos.length; j++) {
          this.pictureToLoadStack.push(photos[j]);
        }
      }
    }

    if (this.isUnmounted) {
      return;
    }
    addEventListener('scroll', () => this.selectPictureToDisplayDebounce(), {
      capture: false,
      passive: true,
      once: true,
    });
  }

  async loadAndroidPhotos(): Promise<void> {
    for (; true; ) {
      const loaded = await listUseCase.loadPhotosCache(20);
      this.androidPhotos = await listUseCase.listPhotoAndroid();
      // console.log('loaded photos : ', loaded);
      if (loaded < 20) {
        return;
      }
      if (this.isUnmounted) {
        return;
      }
    }
  }

  async mounted() {
    this.androidPhotos = await listUseCase.listPhotoAndroid();
    this.cloudPhotos = await listUseCase.listPhotoCloud();

    // Generate many photos to test performances
    // const copy = [...this.photos];
    // const perf = [];
    // for(let i = 0; i < 100; i++) {
    //   for (let photo of copy) {
    //     perf.push({...photo, id: `${photo.id}-${i}`})
    //   }
    // }
    // this.photos = perf
    setTimeout(() => (this.pictureToLoadStack = this.photos.slice(0, 20)), 0);

    this.selectPictureToDisplay();
    await this.loadPhotoStack();
    // Background loading all photos in cache
    void this.loadAndroidPhotos();
    // Background sync all photos in cloud
  }

  async loadPhoto(photo: Photo): Promise<void> {
    if (this.linksLoading[photo.id]) {
      return;
    }
    if (photo.type === 'cloud') {
      const cloudPhoto = this.cloudPhotos[photo.index];
      this.linksLoading[photo.id] = true;
      const content = await getUseCase.downloadThumbnail(cloudPhoto);
      this.links[photo.id] = URL.createObjectURL(
        new Blob([content], { type: 'image/jpeg' })
      );
    } else {
      const androidPhoto = this.androidPhotos[photo.index];
      this.linksLoading[photo.id] = true;
      const content = await getUseCase.loadAndroidPhoto(androidPhoto);
      this.links[photo.id] = URL.createObjectURL(
        new Blob([content], { type: 'image/jpeg' })
      );
    }
    return Promise.resolve();
  }
}
</script>

<style lang="scss" scoped>
.photo {
  margin: 2px;
}
.row {
  padding-left: 1px;
  padding-right: 1px;
}
img {
  max-height: 200px;
  max-width: 300px;
}
</style>