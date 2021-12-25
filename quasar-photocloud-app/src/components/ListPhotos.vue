<template>
<div class="row justify-evenly" ref="htmlContainer">
  <div v-for="photo in photos" :key="photo.id" class="photo" style="height:200px;overflow:hidden"> 
    <div v-if="!links[photo.id]" style="width:300px;height:200px;background-color:red">
    </div>
    <router-link v-else :to="{ name: 'picture', params: { id: photo.id} }">
      <img :src="links[photo.id]" :alt="photo.localId"/>
    </router-link> 
  </div>
  </div>
</template>

<script lang="ts">
import { Vue, prop } from 'vue-class-component'
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache'
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI'
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer'
import { ListPhoto } from '../../../pkg/usecase/listPhotoCloud'
import { Todo, Meta } from './models'
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift'
import { SwiftRepo } from '../../../pkg/repository/swift/photo'
import { UploadedPhoto } from '../../../pkg/domain/eUploadedPhoto'
import { GetPhoto } from '../../../pkg/usecase/getPhoto'
import * as _ from 'lodash'

const photocloudConnector = NewPhotocloudConnector()
const cacheConnector = NewCacheConnector()
const swiftConnector = NewSwiftConnector()

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector)
const swiftRepo = new SwiftRepo(swiftConnector)

const listUseCase = new ListPhoto(photocloudRepo, swiftRepo)
const getUseCase : GetPhoto = new GetPhoto(photocloudRepo, swiftRepo)
    
class Props {
  readonly title!: string;
  readonly todos = prop<Todo[]>({ default: () => [] });
  readonly meta!: Meta;
  readonly active!: boolean;
}

export default class ListPhotos extends Vue.with(Props) {
  photos : UploadedPhoto[] = [];
  linksLoading : { [key:string]: boolean} = {}
  links : { [key:string]: string} = {};

  htmlContainer : HTMLElement | null = null;

  selectPictureToDisplayDebounce = _.debounce(() => this.selectPictureToDisplay(), 200)

  selectPictureToDisplay() {
    const document = window.document
    if (!this.htmlContainer) {
      return
    }
      for(let i=0; i< this.htmlContainer.children.length; i++) {
        const item = this.htmlContainer.children.item(i);
        if (!item) {
          continue
        }
        const rect = item.getBoundingClientRect()
        const visible = (
          rect.top <= (window.innerHeight || document.documentElement.clientHeight)
            && rect.left <= (window.innerWidth || document.documentElement.clientWidth)
            && rect.bottom >= 0
            && rect.right >= 0
        )

        if (visible) {
          for (let j = i; j < i+20 && j<this.photos.length; j++) {
            void this.downloadPhoto(this.photos[j])
          }
        }

      }
    addEventListener('scroll', () => this.selectPictureToDisplayDebounce() , { capture: false, passive: true, once: true })

  }

  async mounted() {
    this.photos = await listUseCase.listPhotoCloud()
    
    // Generate many photos to test performances
    // const copy = [...this.photos];
    // const perf = [];
    // for(let i = 0; i < 100; i++) {
    //   for (let photo of copy) {
    //     perf.push({...photo, id: `${photo.id}-${i}`})
    //   }
    // }
    // this.photos = perf

    this.photos.slice(0,30).forEach(photo => {void this.downloadPhoto(photo)})
    this.selectPictureToDisplayDebounce()
  }

  

  async downloadPhoto(photo: UploadedPhoto) : Promise<void>{
    if (this.linksLoading[photo.id]) {
      return
    }
    this.linksLoading[photo.id] = true
    const content = await getUseCase.downloadThumbnail(photo)
    this.links[photo.id] = URL.createObjectURL(new Blob([content]))
    return Promise.resolve()
  }
}
</script>

<style lang="scss" scoped>
.photo {
  margin:2px;
}
.row {
  padding-left:1px;
  padding-right:1px;
}
img {
  max-height:200px;
  max-width:300px;
}
</style>