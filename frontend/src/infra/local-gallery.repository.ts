import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { ILocalGalleryRepository, LocalPhoto, Photo } from '../domain/types';

// We use dynamic imports for native-only libraries to avoid crashes on web
let SQLite: any;
if (Platform.OS !== 'web') {
    SQLite = require('expo-sqlite');
}

export class LocalGalleryRepository implements ILocalGalleryRepository {
  private dbPromise: Promise<any> | null = null;
  private indexedDBPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    if (Platform.OS !== 'web') {
        this.dbPromise = SQLite.openDatabaseAsync('gallery.db');
        this.initDb();
    } else {
        this.indexedDBPromise = this.initIndexedDB();
    }
  }

  private async initIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('gallery', 1);
        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('photos')) {
                const store = db.createObjectStore('photos', { keyPath: 'id' });
                store.createIndex('creationDate', 'creationDate', { unique: false });
            }
        };
        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
    });
  }

  private async initDb() {
    if (Platform.OS === 'web' || !this.dbPromise) return;
    try {
        const db = await this.dbPromise;
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            type TEXT,
            creationDate INTEGER,
            size INTEGER,
            width INTEGER,
            height INTEGER,
            uri TEXT,
            s3_key TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_creationDate ON photos(creationDate);
        `);
    } catch (e) {
        console.error('Failed to initialize SQLite DB', e);
    }
  }

  async listLocalPhotos(): Promise<LocalPhoto[]> {
    if (Platform.OS === 'web') return []; // Web doesn't support local media library access this way
    try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') return [];

        let photos: LocalPhoto[] = [];
        let hasNextPage = true;
        let after: string | undefined = undefined;

        while (hasNextPage) {
          const pagedInfo = await MediaLibrary.getAssetsAsync({
            first: 500,
            after,
            mediaType: 'photo',
            sortBy: [[MediaLibrary.SortBy.creationTime, false]]
          });

          const assets = pagedInfo.assets.map(asset => ({
            id: asset.id,
            uri: asset.uri,
            creationDate: asset.creationTime / 1000,
            size: 0,
            width: asset.width,
            height: asset.height,
            type: 'local' as const,
          }));

          photos = [...photos, ...assets];
          hasNextPage = pagedInfo.hasNextPage;
          after = pagedInfo.endCursor;
        }

        return photos;
    } catch (e) {
        console.error('Error listing local photos:', e);
        return [];
    }
  }

  async saveToCache(photos: Photo[]): Promise<void> {
    if (Platform.OS === 'web') {
        if (!this.indexedDBPromise) return;
        const db = await this.indexedDBPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event: any) => reject(event.target.error);

            store.clear();
            for (const photo of photos) {
                store.add(photo);
            }
        });
    }

    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    try {
        await db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM photos');

            const statement = await db.prepareAsync(
                'INSERT INTO photos (id, type, creationDate, size, width, height, uri, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            try {
                for (const photo of photos) {
                    await statement.executeAsync([
                        photo.id,
                        photo.type,
                        photo.creationDate,
                        photo.size,
                        photo.width,
                        photo.height,
                        (photo as any).uri || null,
                        (photo as any).key || null
                    ]);
                }
            } finally {
                await statement.finalizeAsync();
            }
        });
    } catch (e) {
        console.error('Error saving to SQLite cache:', e);
    }
  }

  async loadFromCache(limit: number = 100, offset: number = 0): Promise<Photo[]> {
    if (Platform.OS === 'web') {
        if (!this.indexedDBPromise) return [];
        const db = await this.indexedDBPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const index = store.index('creationDate');
            const request = index.openCursor(null, 'prev'); // descending order
            let count = 0;
            const results: Photo[] = [];
            let advanced = false;

            request.onsuccess = (event: any) => {
                const cursor = event.target.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }

                if (!advanced && offset > 0) {
                    advanced = true;
                    cursor.advance(offset);
                    return;
                }

                results.push(cursor.value);
                count++;

                if (count < limit) {
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (event: any) => reject(event.target.error);
        });
    }

    if (!this.dbPromise) return [];
    const db = await this.dbPromise;
    try {
        const rows = await db.getAllAsync(
            'SELECT * FROM photos ORDER BY creationDate DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        return rows.map((row: any) => {
            const base = {
                id: row.id,
                type: row.type,
                creationDate: row.creationDate,
                size: row.size,
                width: row.width,
                height: row.height,
            };
            if (row.type === 'local') {
                return { ...base, uri: row.uri } as LocalPhoto;
            } else {
                return { ...base, key: row.s3_key } as any; // UploadedPhoto
            }
        });
    } catch (e) {
        console.error('Error loading from SQLite cache:', e);
        return [];
    }
  }
}
