import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncSettings } from '../domain/types';

const SYNC_SETTINGS_KEY = '@photocloud_sync_settings';

export class SyncSettingsRepository {
  async getSettings(): Promise<SyncSettings> {
    try {
      const stored = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load sync settings', e);
    }
    return { enabledFolders: [] };
  }

  async saveSettings(settings: SyncSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save sync settings', e);
    }
  }

  async isFolderEnabled(folderId: string): Promise<boolean> {
      const settings = await this.getSettings();
      return settings.enabledFolders.includes(folderId);
  }

  async toggleFolder(folderId: string): Promise<void> {
      const settings = await this.getSettings();
      const index = settings.enabledFolders.indexOf(folderId);
      if (index === -1) {
          settings.enabledFolders.push(folderId);
      } else {
          settings.enabledFolders.splice(index, 1);
      }
      await this.saveSettings(settings);
  }
}
