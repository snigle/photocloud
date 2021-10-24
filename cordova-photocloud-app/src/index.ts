import { createApp } from "@vue/runtime-dom";
import { getAccessToken } from "./infra/google/google";
import ListPhotosVue from "./vuecomponents/ListPhotos.vue"
import {login} from "../../pkg/usecase/login"

console.log("running") 

document.addEventListener('deviceready', lolonDeviceReady, false);

async function lolonDeviceReady(): Promise<void> { 
    // Cordova is now initialized. Have fun!

    console.log('Running cordova');
    document.getElementById('deviceready')?.classList.add('ready');
    const accessToken = await getAccessToken()
    await login(accessToken)
    createApp(ListPhotosVue).mount(".app")
}