import { registerRootComponent } from 'expo';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer; // Important pour certains paquets

import App from './App';

registerRootComponent(App);
