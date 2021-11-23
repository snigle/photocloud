<template>
    <div class="col row justify-center" style="min-height:inherit">
      <img class="mainPicture" src="https://www.terredevins.com/wp-content/uploads/2020/07/4000px-kutzig-95.jpg" />
    </div>
</template>

<script lang="ts">
import { Vue, prop } from 'vue-class-component'
import { NewCacheConnector } from '../../../pkg/repository/connectors/cache'
import { NewPhotocloudConnector } from '../../../pkg/repository/connectors/photcloudAPI'
import { PhotoCloud } from '../../../pkg/repository/photocloudAPI/authenticatedCustomer'
// import { ListPhoto } from '../../../pkg/usecase/listPhotoCloud'
import { Todo, Meta } from './models'
import { NewSwiftConnector } from '../../../pkg/repository/connectors/swift'
import { SwiftRepo } from '../../../pkg/repository/swift/photo'
import { UploadedPhoto } from '../../../pkg/domain/eUploadedPhoto'
import { GetPhoto } from '../../../pkg/usecase/getPhoto'
// import { Notify } from 'quasar'

const photocloudConnector = NewPhotocloudConnector()
const cacheConnector = NewCacheConnector()
const swiftConnector = NewSwiftConnector()

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector)
const swiftRepo = new SwiftRepo(swiftConnector)

// const listUseCase = new ListPhoto(photocloudRepo, swiftRepo)
    
class Props {
  readonly title!: string;
  readonly todos = prop<Todo[]>({ default: () => [] });
  readonly meta!: Meta;
  readonly active!: boolean;
}

export default class Picture extends Vue.with(Props) {
  photos : UploadedPhoto[] = [];
  links : { [key:string]: string} = {};
    slide = 1;

  async mounted() {
    // this.photos = await listUseCase.listPhotoCloud()
    // this.photos.map(photo => this.downloadPhoto(photo))
  }

  async downloadPhoto(photo: UploadedPhoto) : Promise<void>{
    const content = await new GetPhoto(photocloudRepo, swiftRepo).getPhoto(photo)
    this.links[photo.thumbnailURL] = URL.createObjectURL(new Blob([content]))
  }
}
</script>

<style lang="scss" scoped>
.mainPicture {
     display:block;
     width:auto;height:auto;max-height:100%;max-width:100%;
}
</style>