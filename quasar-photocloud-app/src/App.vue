<template>
  <router-view v-if="logged" />
  <div v-else-if="loading">Loading</div>
  <div v-else @click="login()">Click here to login</div>
</template>
<script lang="ts">
/* eslint-disable  @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call*/

import { Vue } from 'vue-class-component';
import { NewCacheConnector } from '../../pkg/repository/connectors/cache';
import { NewPhotocloudConnector } from '../../pkg/repository/connectors/photcloudAPI';
import { PhotoCloud } from '../../pkg/repository/photocloudAPI/authenticatedCustomer';
import { Login } from '../../pkg/usecase/login';

import '@codetrix-studio/capacitor-google-auth';
import { Plugins } from '@capacitor/core';

const photocloudConnector = NewPhotocloudConnector();
const cacheConnector = NewCacheConnector();

const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector);

const loginUsecase = new Login(photocloudRepo);

export default class App extends Vue {
  logged = false;
  loading = true;

  async mounted() {
    if (await loginUsecase.isLogged()) {
      this.logged = true;
      return;
    }

    // execute only for web
    try {
      Plugins.GoogleAuth.initialize();
    } catch (e) {
      console.info('initialize is not exectued');
    }

    this.loading = false;
  }

  async login() {
    this.loading = true;
    try {
      const response = await Plugins.GoogleAuth.signIn();
      await loginUsecase.login(
        response.serverAuthCode
      );
      this.logged = true;
    } catch (e) {
      console.log('fail to login', e);
    } finally {
      this.loading = false;
    }
  }
}
</script>
