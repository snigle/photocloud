<template>
  <router-view v-if="logged" />
  <div v-else-if="loading">
    Loading
  </div>
  <div v-else @click="login()">
  Click here to login
  </div>
</template>
<script lang="ts">
import { Vue } from 'vue-class-component'
import { GoogleAuth } from '@reslear/capacitor-google-auth';
import { NewCacheConnector } from '../../pkg/repository/connectors/cache';
import { NewPhotocloudConnector } from '../../pkg/repository/connectors/photcloudAPI';
import { PhotoCloud } from '../../pkg/repository/photocloudAPI/authenticatedCustomer';
import { Login } from '../../pkg/usecase/login';

  const photocloudConnector = NewPhotocloudConnector()
  const cacheConnector = NewCacheConnector()
  
  const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector)

  const loginUsecase = new Login(photocloudRepo)

export default class App extends Vue {

  logged = false;
  loading = true;

  async mounted() {
    

    if (await loginUsecase.isLogged()) {
      this.logged = true;
      return
    }

  // use hook after platform dom ready
  GoogleAuth.initialize({
    clientId: '590660982246-cmmp4c3blkcdke8s64grt75pc36imab4.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    grantOfflineAccess: false,

  });
  this.loading = false
  }

  async login() {
    this.loading = true
    const response = await GoogleAuth.signIn();
        await loginUsecase.login(response.authentication.accessToken)
      this.logged=true
      this.loading = false
  }
}
</script>
