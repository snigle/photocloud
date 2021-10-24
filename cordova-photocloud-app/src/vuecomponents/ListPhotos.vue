<template>
  <div>
    vue started
  </div>
</template>
<script lang="ts">
import { Vue, Options } from 'vue-class-component'
import { listPhotoCloud } from '../../../pkg/usecase/listPhotoCloud'
import { UploadedPhoto } from '../../../pkg/domain/eUploadedPhoto'

// Define the component in class-style
@Options({})
export default class extends Vue {
  // Class properties will be component data
  count = 0
  // photos : UploadedPhoto[] = []
  // Methods will be component methods
  increment() {
    this.count++
  }

  decrement() {
    this.count--
  }

  mounted() {
    listPhotoCloud()
  }
}
</script>