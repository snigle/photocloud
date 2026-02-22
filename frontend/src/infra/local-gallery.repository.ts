import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import { ILocalGalleryRepository, LocalPhoto, Photo } from '../domain/types';

export class LocalGalleryRepository implements ILocalGalleryRepository {
  private dbPromise: Promise<SQLite.SQLiteDatabase>;

  constructor() {
    this.dbPromise = SQLite.openDatabaseAsync('gallery.db');
    this.initDb();
  }

  private async initDb() {
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
