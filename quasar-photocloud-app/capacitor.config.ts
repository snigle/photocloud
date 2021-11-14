import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.github.snigle.photocloud',
  appName: 'PhotoCloud',
  webDir: 'dist/spa',
  bundledWebRuntime: false
};

export default config;
// {
//   "appId": "io.github.snigle.photocloud",
//   "appName": "Photocloud",
//   "bundledWebRuntime": false,
//   "npmClient": "yarn",
//   "webDir": "www"
// }