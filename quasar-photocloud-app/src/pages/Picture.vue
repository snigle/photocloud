<template>
  <q-page class="column" :style-fn="myTweak">
    <pic :id="$route.params.id"/>
  </q-page>
</template>

<script lang="ts">
import Picture from 'components/Picture.vue';
import { Vue, Options } from 'vue-class-component'

@Options({
  components: { pic: Picture }
})
export default class PicturePage extends Vue {

  mounted() {
    console.log('picture id', this.$route.params.id)
  }
     myTweak (offset: number) {
      // "offset" is a Number (pixels) that refers to the total
      // height of header + footer that occupies on screen,
      // based on the QLayout "view" prop configuration

      // this is actually what the default style-fn does in Quasar
      return { height: offset ? `calc(100vh - ${offset}px)` : '100vh' }
    }
};
</script>
