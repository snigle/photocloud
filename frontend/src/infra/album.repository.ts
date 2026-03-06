import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText } from './utils';
import { GlobalLock } from './locks';

// Simple memory cache for albums index to speed up navigation
const albumsCache = new Map<string, { data: Album[], timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds
const pendingRequests = new Map<string, Promise<Album[]>>();

export class AlbumRepository implements IAlbumRepository {
  private s3Repo: IS3Repository;

  constructor(s3Repo: IS3Repository) {
    this.s3Repo = s3Repo;
  }

  private getAlbumKey(email: string, albumId: string): string {
    return `users/${email}/albums/${albumId}.json`;
  }

  private getAlbumsIndexKey(email: string): string {
    return `users/${email}/albums/index.json`;
  }

  async listAlbums(bucket: string, email: string, skipCache = false): Promise<Album[]> {
    const indexKey = this.getAlbumsIndexKey(email);

    if (!skipCache && albumsCache.has(indexKey)) {
        const cached = albumsCache.get(indexKey)!;
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`AlbumRepository: Returning cached albums for ${email}`);
            return cached.data;
        }
    }

    if (pendingRequests.has(indexKey)) {
        console.log(`AlbumRepository: Joining pending request for ${indexKey}`);
        return pendingRequests.get(indexKey)!;
    }

    const request = (async () => {
    try {
        console.log(`AlbumRepository: Loading albums from index ${indexKey}`);
        const indexData = await this.s3Repo.getFile(bucket, indexKey);
        const albums = JSON.parse(decodeText(indexData)) as Album[];

            let needsUpdate = false;
            const processed = albums.map(a => {
                if (a.photoKeys) {
                    needsUpdate = true;
                    return {
                        ...a,
                        photoCount: a.photoCount ?? a.photoKeys.length,
                        photoKeys: undefined
                    };
                }
                return {
                    ...a,
                    photoCount: a.photoCount ?? 0
                };
            });

            if (needsUpdate) {
                console.log('AlbumRepository: Lightening index on the fly');
                // Don't await, do it in background
                this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(processed)), 'application/json')
                    .catch(e => console.error('Failed to update light index', e));
            }

            albumsCache.set(indexKey, { data: processed, timestamp: Date.now() });
            return processed;
    } catch (e: any) {
        if (e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404) {
            console.error('Failed to load albums index, falling back to full list', e);
        }
    } finally {
        pendingRequests.delete(indexKey);
    }

    // Fallback: list all individual album files
    console.log(`AlbumRepository: Index not found, falling back to full listing for ${email}`);
    const prefix = `users/${email}/albums/`;
    try {
        const keys = await this.s3Repo.listKeys(bucket, prefix);
        const albumKeys = keys.filter(k => k.endsWith('.json') && !k.endsWith('index.json'));

        const albumsData = await Promise.all(albumKeys.map(async (key) => {
            try {
                const data = await this.s3Repo.getFile(bucket, key);
                return JSON.parse(decodeText(data)) as Album;
            } catch (e) {
                console.error(`Failed to load album data for key ${key}`, e);
                return null;
            }
        }));

        const albums = albumsData.filter((a): a is Album => a !== null);

        // Create a light index
        const lightAlbums = albums.map(a => ({
            ...a,
            photoKeys: undefined,
            photoCount: a.photoCount ?? a.photoKeys?.length ?? 0
        }));

        // Save the index for next time
        await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(lightAlbums)), 'application/json');

        albumsCache.set(indexKey, { data: lightAlbums, timestamp: Date.now() });
        return albums;
    } catch (e) {
        console.error('Failed to list albums', e);
    }

    return [];
    })();

    pendingRequests.set(indexKey, request);
    return request;
  }

  async getAlbum(bucket: string, email: string, albumId: string): Promise<Album> {
    const key = this.getAlbumKey(email, albumId);
    const data = await this.s3Repo.getFile(bucket, key);
    return JSON.parse(decodeText(data));
  }

  async saveAlbum(bucket: string, email: string, album: Album): Promise<void> {
    const release = await GlobalLock.acquire(`albums-${email}`);
    try {
        const key = this.getAlbumKey(email, album.id);
        const data = encodeText(JSON.stringify(album));
        await this.s3Repo.uploadFile(bucket, key, data, 'application/octet-stream');

        // Update index
        try {
            const albums = await this.listAlbums(bucket, email, true); // skip cache to get latest

            // Light version of the album for the index
            const lightAlbum = {
                ...album,
                photoKeys: undefined,
                photoCount: album.photoKeys?.length ?? album.photoCount ?? 0
            };

            const index = albums.findIndex(a => a.id === album.id);
            if (index >= 0) {
                albums[index] = lightAlbum;
            } else {
                albums.push(lightAlbum);
            }

            // Re-map to ensure all items in index are light
            const lightIndex = albums.map(a => ({
                ...a,
                photoKeys: undefined,
                photoCount: a.photoCount ?? a.photoKeys?.length ?? 0
            }));

            const indexKey = this.getAlbumsIndexKey(email);
            await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(lightIndex)), 'application/json');
            albumsCache.set(indexKey, { data: lightIndex, timestamp: Date.now() });
        } catch (e) {
            console.error('Failed to update albums index after save', e);
        }
    } finally {
        release();
    }
  }

  async deleteAlbum(bucket: string, email: string, albumId: string): Promise<void> {
    console.log(`AlbumRepository: Deleting album ${albumId} for ${email}`);
    const release = await GlobalLock.acquire(`albums-${email}`);
    try {
        const key = this.getAlbumKey(email, albumId);
        await this.s3Repo.deleteFile(bucket, key);
        console.log(`AlbumRepository: Deleted album file ${key}`);

        // Update index
        try {
            console.log(`AlbumRepository: Updating index after deletion of ${albumId}`);
            const albums = await this.listAlbums(bucket, email, true); // skip cache
            const filtered = albums.filter(a => a.id !== albumId);
            const indexKey = this.getAlbumsIndexKey(email);
            await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(filtered)), 'application/json');
            albumsCache.set(indexKey, { data: filtered, timestamp: Date.now() });
            console.log(`AlbumRepository: Index updated successfully for ${email}`);
        } catch (e) {
            console.error('Failed to update albums index after delete', e);
        }
    } finally {
        release();
    }
  }
}
