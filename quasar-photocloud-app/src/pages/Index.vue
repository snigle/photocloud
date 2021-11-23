<template>
  <q-page class="row column items-center justify-evenly">
    <upload-photo />
    <list-photos
    ></list-photos>
  </q-page>
</template>

<script lang="ts">
import ListPhotos from 'components/ListPhotos.vue';
import UploadPhoto from 'components/UploadPhoto.vue';
import { Vue, Options } from 'vue-class-component'

@Options({
  components: { ListPhotos, UploadPhoto }
})
export default class PageIndex extends Vue {
};
</script>
