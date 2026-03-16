import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText, uint8ArrayToBase64, limitConcurrency } from './utils';
import { GlobalLock } from './locks';
import * as Crypto from 'expo-crypto';

// Simple memory cache for albums index to speed up navigation
export const albumsCache = new Map<string, { data: Album[], timestamp: number }>();
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
        console.log(`AlbumRepository: Scanning for shared albums in ${sharedPath}`);
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
                    sharedAlbum.ownerEmail = ownerEmail;

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

    // 1. Check Memory Cache
    if (!skipCache && albumsCache.has(indexKey)) {
        const cached = albumsCache.get(indexKey)!;
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`AlbumRepository: Returning cached local albums for ${email}`);
            const localAlbums = cached.data;
            const sharedAlbums = await this.discoverSharedAlbums(bucket, email);
            return [...localAlbums, ...sharedAlbums];
        }
    }

    // 2. Joining pending request
    if (pendingRequests.has(indexKey)) {
        console.log(`AlbumRepository: Joining pending request for ${indexKey}`);
        return pendingRequests.get(indexKey)!;
    }

    const request = (async () => {
        let localAlbums: Album[] = [];
        let needsIndexUpdate = false;

        try {
            // 3. Try to Load Index
            console.log(`AlbumRepository: Fetching index ${indexKey}`);
            const indexData = await this.s3Repo.getFile(bucket, indexKey);
            const albums = JSON.parse(decodeText(indexData)) as Album[];

            localAlbums = albums.filter(a => {
                if (!a.albumKey) {
                    console.warn(`AlbumRepository: Hiding incompatible old album ${a.id} from index`);
                    needsIndexUpdate = true;
                    return false;
                }
                // Only keep local albums in the local index
                if (a.ownerEmail && a.ownerEmail !== email) {
                    needsIndexUpdate = true;
                    return false;
                }
                return true;
            });

            // Check if any local album in index has photoKeys (should be light)
            if (localAlbums.some(a => a.photoKeys !== undefined)) {
                needsIndexUpdate = true;
            }

        } catch (e: any) {
            if (e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404) {
                console.error(`Failed to load index ${indexKey}, falling back to full listing`, e);
            }

            // 4. Fallback: Full Listing
            console.log(`AlbumRepository: Fallback to full listing for ${email}`);
            const prefix = `users/${email}/albums/`;
            try {
                const keys = await this.s3Repo.listKeys(bucket, prefix, '/');
                const albumKeys = keys.filter(k => k.endsWith('.json') && !k.endsWith('index.json'));

                const albumsData = await Promise.all(albumKeys.map(async (key) => {
                    try {
                        const data = await this.s3Repo.getFile(bucket, key);
                        const album = JSON.parse(decodeText(data)) as Album;
                        if (!album.albumKey) {
                            console.warn(`AlbumRepository: Hiding incompatible old album ${album.id} from file listing`);
                            return null;
                        }
                        return album;
                    } catch (e) {
                        return null;
                    }
                }));

                localAlbums = albumsData.filter((a): a is Album => a !== null);
                needsIndexUpdate = true;
            } catch (err) {
                console.error('Failed full album listing', err);
            }
        } finally {
            pendingRequests.delete(indexKey);
        }

        // 5. Discover Shared Albums
        const sharedAlbums = await this.discoverSharedAlbums(bucket, email);

        // 6. Update and Cache Index
        const lightLocalAlbums = localAlbums.map(a => ({
            ...a,
            photoKeys: undefined,
            photoCount: a.photoCount ?? a.photoKeys?.length ?? 0,
            albumKey: a.albumKey // Maintain albumKey in index
        }));

        if (needsIndexUpdate) {
            console.log('AlbumRepository: Saving updated light index');
            this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(lightLocalAlbums)), 'application/json')
                .catch(e => console.error('Failed to update light index', e));
        }

        albumsCache.set(indexKey, { data: lightLocalAlbums, timestamp: Date.now() });

        // 7. Return combined list (with full photoKeys for shared if they were just discovered, or light if preferred)
        return [...localAlbums, ...sharedAlbums];
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
        const albumPhotoKeys: string[] = new Array(originalPhotoKeys.length);

        // Clone thumbnails to album folder (encrypted with albumKey)
        if (originalPhotoKeys.length > 0) {
            const tasks = originalPhotoKeys.map((photoKey, idx) => async () => {
                const photoId = this.extractPhotoIdFromKey(photoKey);
                const albumThumbnailKey = this.getAlbumThumbnailKey(email, album.id, photoId);
                albumPhotoKeys[idx] = albumThumbnailKey;

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

        // Update the album object in place with new keys
        const albumCoverPhotoId = album.coverPhotoKey ? this.extractPhotoIdFromKey(album.coverPhotoKey) : undefined;
        album.photoKeys = albumPhotoKeys;
        if (albumCoverPhotoId) {
            album.coverPhotoKey = this.getAlbumThumbnailKey(email, album.id, albumCoverPhotoId);
        }

        const data = encodeText(JSON.stringify(album));
        await this.s3Repo.uploadFile(bucket, key, data, 'application/octet-stream');

        // Sharing logic
        if (album.sharedWith && album.sharedWith.length > 0) {
            for (const sharedUser of album.sharedWith) {
                const sharedPath = this.getSharedAlbumPath(sharedUser, email, album.id);

                // Write albumKey in plain text to recipient's folder
                await this.s3Repo.uploadFile(bucket, `${sharedPath}key.txt`, encodeText(album.albumKey!), 'text/plain');

                // Clone thumbnails for shared user using client-side cloning
                const sharedPhotoKeys: string[] = new Array(originalPhotoKeys.length);
                if (originalPhotoKeys.length > 0) {
                    const tasks = originalPhotoKeys.map((photoKey, idx) => async () => {
                        const photoId = this.extractPhotoIdFromKey(photoKey);
                        const destThumbnailKey = `${sharedPath}thumbnails/${photoId}.jpg.enc`;
                        sharedPhotoKeys[idx] = destThumbnailKey;

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
                    coverPhotoKey: albumCoverPhotoId ? `${sharedPath}thumbnails/${albumCoverPhotoId}.jpg.enc` : undefined
                };
                const sharedData = encodeText(JSON.stringify(sharedAlbum));
                await this.s3Repo.uploadFile(bucket, `${sharedPath}album.json`, sharedData, 'application/octet-stream', album.albumKey);
            }
        }

        // Update index (Only local albums should be in the index.json)
        try {
            const indexKey = this.getAlbumsIndexKey(email);
            let indexAlbums: Album[] = [];
            try {
                const indexData = await this.s3Repo.getFile(bucket, indexKey);
                indexAlbums = JSON.parse(decodeText(indexData)) as Album[];
            } catch (e) {
                // If index missing, it will be recreated on next list
            }

            // Update or add the saved album in the index
            const lightAlbum = {
                ...album,
                photoKeys: undefined,
                photoCount: album.photoKeys?.length ?? album.photoCount ?? 0,
                albumKey: album.albumKey // Keep key in index
            };

            const idx = indexAlbums.findIndex(a => a.id === album.id);
            if (idx >= 0) {
                indexAlbums[idx] = lightAlbum;
            } else {
                indexAlbums.push(lightAlbum);
            }

            await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(indexAlbums)), 'application/json');
            // Update local memory cache immediately to reflect the change without discovery
            albumsCache.set(indexKey, { data: indexAlbums, timestamp: Date.now() });
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

  async listPhotos(bucket: string, email: string, albumId: string): Promise<UploadedPhoto[]> {
    const album = await this.getAlbum(bucket, email, albumId);
    if (!album || !album.photoKeys) return [];

    return album.photoKeys.map(key => {
        const parts = key.split('/');
        const filename = parts.pop()!;
        const namePart = filename.replace('.enc', '').replace('.json', '').replace('.jpg', '');
        const timestampMatch = namePart.match(/^(\d+)-/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
        const id = timestampMatch ? namePart.substring(timestampMatch[0].length) : namePart;

        return {
            id: id,
            key: key,
            creationDate: timestamp,
            size: 0,
            width: 0,
            height: 0,
            type: 'cloud' as const,
        };
    });
  }
}
