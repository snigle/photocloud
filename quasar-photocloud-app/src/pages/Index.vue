<template>
  <q-page class="row items-center justify-evenly">
    <upload-photo />
    <list-photos
      title="Example component"
      active
      :todos="todos"
      :meta="meta"
    ></list-photos>
  </q-page>
</template>

<script lang="ts">
import { Todo, Meta } from '../components/models';
import ListPhotos from 'components/ListPhotos.vue';
import UploadPhoto from 'components/UploadPhoto.vue';
import { Vue, Options } from 'vue-class-component'

@Options({
  components: { ListPhotos, UploadPhoto }
})
export default class PageIndex extends Vue {
  todos: Todo[] = [
    {
      id: 1,
      content: 'ct1'
    },
    {
      id: 2,
      content: 'ct2'
    },
    {
      id: 3,
      content: 'ct3'
    },
    {
      id: 4,
      content: 'ct4'
    },
    {
      id: 5,
      content: 'ct5'
    }
  ];
  meta: Meta = {
    totalCount: 1200
  };
};
</script>
