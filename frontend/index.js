import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer; // Important pour certains paquets

import * as TaskManager from 'expo-task-manager';
import { SyncPhotosUseCase } from './src/usecase/sync-photos.usecase';
import { S3Repository } from './src/infra/s3.repository';
import { LocalGalleryRepository } from './src/infra/local-gallery.repository';
import { SyncSettingsRepository } from './src/infra/sync-settings.repository';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BACKGROUND_SYNC_TASK } from './src/domain/constants';

if (Platform.OS !== 'web') {
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
        console.log('Background task running...');
        try {
            const stored = await AsyncStorage.getItem('@photocloud_session');
            if (!stored) {
                console.log('Background task: No session found, skipping');
                return;
            }

            const session = JSON.parse(stored);
            const s3Repo = new S3Repository(session.creds);
            const localRepo = new LocalGalleryRepository();
            const syncSettingsRepo = new SyncSettingsRepository();
            const syncUseCase = new SyncPhotosUseCase(s3Repo, localRepo, syncSettingsRepo);

            const count = await syncUseCase.execute(session.creds, session.email);
            console.log(`Background task: Synced ${count} photos`);
            return count > 0 ? 1 : 0;
        } catch (error) {
            console.error('Background task failed:', error);
            return 0;
        }
    });
}

import App from './App';

registerRootComponent(App);
