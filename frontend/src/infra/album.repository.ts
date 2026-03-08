import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText, uint8ArrayToBase64 } from './utils';
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

  private getSharedAlbumPath(recipientEmail: string, ownerEmail: string, albumId: string): string {
    return `users/${recipientEmail}/albums/shared/${ownerEmail}/${albumId}/`;
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
        let albums = JSON.parse(decodeText(indexData)) as Album[];

        // Discover shared albums by listing users/*/albums/shared/{email}/
        try {
            const sharedRootPrefix = `users/`;
            const owners = await this.s3Repo.listFolders(bucket, sharedRootPrefix);
            for (const ownerPrefix of owners) {
                const ownerEmail = ownerPrefix.split('/')[1];
                if (ownerEmail === email) continue;

                const sharedPath = `users/${ownerEmail}/albums/shared/${email}/`;
                const albumFolders = await this.s3Repo.listFolders(bucket, sharedPath);
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
                        albums.push(sharedAlbum);
                    } catch (e) {
                        // Skip if error reading this shared album
                    }
                }
            }
        } catch (e) {
            console.error('Failed to discover shared albums', e);
        }

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

        let albums = albumsData.filter((a): a is Album => a !== null);

        // Discover shared albums (fallback logic)
        try {
            const sharedRootPrefix = `users/`;
            const owners = await this.s3Repo.listFolders(bucket, sharedRootPrefix);
            for (const ownerPrefix of owners) {
                const ownerEmail = ownerPrefix.split('/')[1];
                if (ownerEmail === email) continue;

                const sharedPath = `users/${ownerEmail}/albums/shared/${email}/`;
                const albumFolders = await this.s3Repo.listFolders(bucket, sharedPath);
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
                        albums.push(sharedAlbum);
                    } catch (e) {
                        // Skip
                    }
                }
            }
        } catch (e) {
            // Ignore
        }

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
        // Ensure album has a key
        if (!album.albumKey) {
            album.albumKey = uint8ArrayToBase64(Crypto.getRandomBytes(32));
        }

        const key = this.getAlbumKey(email, album.id);
        const data = encodeText(JSON.stringify(album));
        await this.s3Repo.uploadFile(bucket, key, data, 'application/octet-stream');

        // Helper for batching promises
        const limitConcurrency = async <T>(tasks: (() => Promise<T>)[], limit: number) => {
            const results: T[] = [];
            for (let i = 0; i < tasks.length; i += limit) {
                const chunk = tasks.slice(i, i + limit);
                results.push(...(await Promise.all(chunk.map(t => t()))));
            }
            return results;
        };

        // Clone thumbnails to album folder (encrypted with albumKey)
        if (album.photoKeys) {
            const tasks = album.photoKeys.map(photoKey => async () => {
                const parts = photoKey.split('/');
                const filename = parts.pop()!;
                const photoId = filename.replace('.enc', '').split('-').pop()!;
                const albumThumbnailKey = this.getAlbumThumbnailKey(email, album.id, photoId);

                if (!(await this.s3Repo.exists(bucket, albumThumbnailKey, album.albumKey))) {
                    console.log(`AlbumRepository: Cloning thumbnail ${photoKey} to ${albumThumbnailKey} with albumKey`);
                    try {
                        const thumbnailData = await this.s3Repo.getFile(bucket, photoKey);
                        await this.s3Repo.uploadFile(bucket, albumThumbnailKey, thumbnailData, 'application/octet-stream', album.albumKey);
                    } catch (e) {
                        console.error(`Failed to clone thumbnail ${photoKey}`, e);
                    }
                }
            });
            await limitConcurrency(tasks, 5);
        }

        // Sharing logic
        if (album.sharedWith && album.sharedWith.length > 0) {
            for (const sharedUser of album.sharedWith) {
                const sharedPath = this.getSharedAlbumPath(sharedUser, email, album.id);

                // Write albumKey in plain text to recipient's folder
                await this.s3Repo.uploadFile(bucket, `${sharedPath}key.txt`, encodeText(album.albumKey!), 'text/plain');

                // Upload shared JSON (encrypted with albumKey)
                const sharedAlbum = { ...album, ownerEmail: email };
                const sharedData = encodeText(JSON.stringify(sharedAlbum));
                await this.s3Repo.uploadFile(bucket, `${sharedPath}album.json`, sharedData, 'application/octet-stream', album.albumKey);

                // Clone thumbnails for shared user using server-side CopyObject
                if (album.photoKeys) {
                    const tasks = album.photoKeys.map(photoKey => async () => {
                        const parts = photoKey.split('/');
                        const filename = parts.pop()!;
                        const photoId = filename.replace('.enc', '').split('-').pop()!;
                        const destThumbnailKey = `${sharedPath}thumbnails/${photoId}.jpg.enc`;

                        if (!(await this.s3Repo.exists(bucket, destThumbnailKey, album.albumKey))) {
                            console.log(`AlbumRepository: Copying thumbnail ${photoKey} to ${destThumbnailKey}`);
                            try {
                                // Source is chiffré with userKey (default), Dest is chiffré with albumKey
                                await this.s3Repo.copyObject(bucket, photoKey, destThumbnailKey, undefined, album.albumKey);
                            } catch (e) {
                                console.error(`Failed to copy thumbnail ${photoKey}`, e);
                            }
                        }
                    });
                    await limitConcurrency(tasks, 5);
                }
            }
        }

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
