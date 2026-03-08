import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText, uint8ArrayToBase64, limitConcurrency } from './utils';
import { GlobalLock } from './locks';
import * as Crypto from 'expo-crypto';

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

  private getSharedAlbumsIndexKey(email: string): string {
    return `users/${email}/albums/shared_index.json`;
  }

  private getSharedAlbumKey(ownerEmail: string, sharedWithEmail: string, albumId: string): string {
    return `users/${ownerEmail}/albums/share/${sharedWithEmail}/${albumId}.json`;
  }

  private getSharedAlbumThumbnailKey(ownerEmail: string, sharedWithEmail: string, albumId: string, photoId: string): string {
    return `users/${ownerEmail}/albums/share/${sharedWithEmail}/${photoId}.jpg.enc`;
  }

  private getSharedAlbumShareKeyPath(ownerEmail: string, sharedWithEmail: string, albumId: string): string {
    return `users/${ownerEmail}/albums/${albumId}/share/${sharedWithEmail}/key.txt`;
  }

  private getAlbumThumbnailKey(email: string, albumId: string, photoId: string): string {
    return `users/${email}/albums/${albumId}/thumbnails/${photoId}.jpg.enc`;
  }

  private extractPhotoIdFromKey(key: string): string {
    const filename = key.split('/').pop()!;
    return filename.replace('.enc', '').replace('.jpg', '').split('-').pop()!;
  }

  private getSharedAlbumPath(recipientEmail: string, ownerEmail: string, albumId: string): string {
    return `users/${recipientEmail}/albums/shared/${ownerEmail}/${albumId}/`;
  }

  private getAlbumsSharedWithMePath(email: string): string {
    return `users/${email}/albums/shared/`;
  }

  private async discoverSharedAlbums(bucket: string, email: string): Promise<Album[]> {
    const sharedAlbums: Album[] = [];
    try {
        const sharedPath = this.getAlbumsSharedWithMePath(email);
        const owners = await this.s3Repo.listFolders(bucket, sharedPath);
        for (const ownerPrefix of owners) {
            const ownerEmail = ownerPrefix.split('/').filter(Boolean).pop()!;
            const ownerAlbumsPath = `${sharedPath}${ownerEmail}/`;
            const albumFolders = await this.s3Repo.listFolders(bucket, ownerAlbumsPath);

            for (const albumFolderPrefix of albumFolders) {
                try {
                    const albumId = albumFolderPrefix.split('/').filter(Boolean).pop()!;
                    const keyPath = `${albumFolderPrefix}key.txt`;
                    const albumKeyData = await this.s3Repo.getFile(bucket, keyPath);
                    const albumKey = decodeText(albumKeyData);

                    const albumJsonPath = `${albumFolderPrefix}album.json`;
                    const albumData = await this.s3Repo.getFile(bucket, albumJsonPath, albumKey);
                    const sharedAlbum = JSON.parse(decodeText(albumData)) as Album;
                    sharedAlbum.albumKey = albumKey;

                    // Rewrite keys to point to the shared location in recipient's space
                    const sharedPath = albumFolderPrefix;
                    sharedAlbum.photoKeys = sharedAlbum.photoKeys?.map(pk => {
                        const photoId = this.extractPhotoIdFromKey(pk);
                        return `${sharedPath}thumbnails/${photoId}.jpg.enc`;
                    });
                    if (sharedAlbum.coverPhotoKey) {
                        const coverId = this.extractPhotoIdFromKey(sharedAlbum.coverPhotoKey);
                        sharedAlbum.coverPhotoKey = `${sharedPath}thumbnails/${coverId}.jpg.enc`;
                    }

                    sharedAlbums.push(sharedAlbum);
                } catch (e) {
                    // Skip if error reading this shared album
                }
            }
        }
    } catch (e) {
        console.error('Failed to discover shared albums', e);
    }
    return sharedAlbums;
  }

  async listAlbums(bucket: string, email: string, skipCache = false): Promise<Album[]> {
    const indexKey = this.getAlbumsIndexKey(email);

    if (!skipCache && albumsCache.has(indexKey)) {
        const cached = albumsCache.get(indexKey)!;
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`AlbumRepository: Returning cached albums for ${email}`);
            // Keep local albums from cache, but always re-discover shared albums
            // as they are external and don't trigger local cache invalidation
            const localAlbums = cached.data.filter(a => !a.ownerEmail || a.ownerEmail === email);
            const sharedAlbums = await this.discoverSharedAlbums(bucket, email);
            return [...localAlbums, ...sharedAlbums];
        }
    }

    if (pendingRequests.has(indexKey)) {
        console.log(`AlbumRepository: Joining pending request for ${indexKey}`);
        return pendingRequests.get(indexKey)!;
    }

    const request = (async () => {
    try {
        console.log(`AlbumRepository: Loading albums from index ${indexKey}`);
        let indexData: Uint8Array;
        try {
            indexData = await this.s3Repo.getFile(bucket, indexKey);
        } catch (e: any) {
            // Retry once for index
            console.warn(`Failed to fetch index ${indexKey}, retrying once...`);
            indexData = await this.s3Repo.getFile(bucket, indexKey);
        }
        let albums = JSON.parse(decodeText(indexData)) as Album[];

        // Discover shared albums
        const sharedAlbums = await this.discoverSharedAlbums(bucket, email);
        albums = [...albums, ...sharedAlbums];

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
            return albums;
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

        let albums = albumsData.filter((a): a is Album => a !== null);

        // Discover shared albums (fallback logic)
        const sharedAlbums = await this.discoverSharedAlbums(bucket, email);
        albums = [...albums, ...sharedAlbums];

        // Create a light index (Only local albums)
        const localAlbums = albums.filter(a => !a.ownerEmail || a.ownerEmail === email);
        const lightAlbums = localAlbums.map(a => ({
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
        // Ensure album has a key
        if (!album.albumKey) {
            album.albumKey = uint8ArrayToBase64(Crypto.getRandomBytes(32));
        }

        const key = this.getAlbumKey(email, album.id);

        // Update photo keys to point to cloned thumbnails in the album folder
        const originalPhotoKeys = album.photoKeys || [];
        const albumPhotoKeys: string[] = [];

        // Clone thumbnails to album folder (encrypted with albumKey)
        if (originalPhotoKeys.length > 0) {
            const tasks = originalPhotoKeys.map(photoKey => async () => {
                const photoId = this.extractPhotoIdFromKey(photoKey);
                const albumThumbnailKey = this.getAlbumThumbnailKey(email, album.id, photoId);
                albumPhotoKeys.push(albumThumbnailKey);

                if (!(await this.s3Repo.exists(bucket, albumThumbnailKey, album.albumKey))) {
                    console.log(`AlbumRepository: Cloning thumbnail ${photoKey} to ${albumThumbnailKey} with albumKey`);
                    try {
                        // Determine source encryption key: if photoKey is already an album path, use albumKey
                        const sourceKey = photoKey.includes('/albums/') ? album.albumKey : undefined;
                        const thumbnailData = await this.s3Repo.getFile(bucket, photoKey, sourceKey);
                        await this.s3Repo.uploadFile(bucket, albumThumbnailKey, thumbnailData, 'application/octet-stream', album.albumKey);
                    } catch (e) {
                        console.error(`Failed to clone thumbnail ${photoKey}`, e);
                    }
                }
            });
            await limitConcurrency(tasks, 5);
        }

        // Update the album object with new keys
        const updatedAlbum = {
            ...album,
            photoKeys: albumPhotoKeys,
            coverPhotoKey: album.coverPhotoKey ? this.getAlbumThumbnailKey(email, album.id, this.extractPhotoIdFromKey(album.coverPhotoKey)) : undefined
        };

        const data = encodeText(JSON.stringify(updatedAlbum));
        await this.s3Repo.uploadFile(bucket, key, data, 'application/octet-stream');

        // Sharing logic
        if (album.sharedWith && album.sharedWith.length > 0) {
            for (const sharedUser of album.sharedWith) {
                const sharedPath = this.getSharedAlbumPath(sharedUser, email, album.id);

                // Write albumKey in plain text to recipient's folder
                await this.s3Repo.uploadFile(bucket, `${sharedPath}key.txt`, encodeText(album.albumKey!), 'text/plain');

                const sharedPhotoKeys: string[] = [];

                // Clone thumbnails for shared user using server-side CopyObject
                if (originalPhotoKeys.length > 0) {
                    const tasks = originalPhotoKeys.map(photoKey => async () => {
                        const photoId = this.extractPhotoIdFromKey(photoKey);
                        const destThumbnailKey = `${sharedPath}thumbnails/${photoId}.jpg.enc`;
                        sharedPhotoKeys.push(destThumbnailKey);

                        if (!(await this.s3Repo.exists(bucket, destThumbnailKey, album.albumKey))) {
                            console.log(`AlbumRepository: Copying thumbnail ${photoKey} to ${destThumbnailKey}`);
                            try {
                                // Determine source encryption key: if photoKey is already an album path, use albumKey
                                const sourceSSEKey = photoKey.includes('/albums/') ? album.albumKey : undefined;
                                const thumbnailData = await this.s3Repo.getFile(bucket, photoKey, sourceSSEKey);
                                await this.s3Repo.uploadFile(bucket, destThumbnailKey, thumbnailData, 'application/octet-stream', album.albumKey);
                            } catch (e) {
                                console.error(`Failed to copy thumbnail ${photoKey}`, e);
                                throw e; // Re-throw to make the whole process fail
                            }
                        }
                    });
                    await limitConcurrency(tasks, 5);
                }

                // Upload shared JSON (encrypted with albumKey) with updated keys
                const sharedAlbum = {
                    ...album,
                    ownerEmail: email,
                    photoKeys: sharedPhotoKeys,
                    coverPhotoKey: album.coverPhotoKey ? `${sharedPath}thumbnails/${this.extractPhotoIdFromKey(album.coverPhotoKey)}.jpg.enc` : undefined
                };
                const sharedData = encodeText(JSON.stringify(sharedAlbum));
                await this.s3Repo.uploadFile(bucket, `${sharedPath}album.json`, sharedData, 'application/octet-stream', album.albumKey);
            }
        }

        // Update index (Only local albums should be in the index.json)
        try {
            const indexKey = this.getAlbumsIndexKey(email);
            let albums: Album[] = [];
            try {
                const indexData = await this.s3Repo.getFile(bucket, indexKey);
                albums = JSON.parse(decodeText(indexData)) as Album[];
            } catch (e) {
                // If index missing, it will be recreated on next list
            }

            // Update or add the saved album in the index
            const lightAlbum = {
                ...updatedAlbum,
                photoKeys: undefined,
                photoCount: updatedAlbum.photoKeys?.length ?? updatedAlbum.photoCount ?? 0
            };

            const idx = albums.findIndex(a => a.id === updatedAlbum.id);
            if (idx >= 0) {
                albums[idx] = lightAlbum;
            } else {
                albums.push(lightAlbum);
            }

            await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(albums)), 'application/json');
            albumsCache.clear(); // Clear all caches to force fresh load including discovery
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

  async shareAlbum(bucket: string, email: string, albumId: string, shareEmail: string): Promise<Album> {
    const album = await this.getAlbum(bucket, email, albumId);
    if (!album.sharedWith) album.sharedWith = [];
    if (!album.sharedWith.includes(shareEmail)) {
        album.sharedWith.push(shareEmail);
        await this.saveAlbum(bucket, email, album);
    }
    return album;
  }
}
