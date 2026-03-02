import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText } from './utils';
import { GlobalLock } from './locks';

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

  async listAlbums(bucket: string, email: string): Promise<Album[]> {
    const indexKey = this.getAlbumsIndexKey(email);

    try {
        if (await this.s3Repo.exists(bucket, indexKey)) {
            const indexData = await this.s3Repo.getFile(bucket, indexKey);
            return JSON.parse(decodeText(indexData)) as Album[];
        }
    } catch (e) {
        console.error('Failed to load albums index, falling back to full list', e);
    }

    // Fallback: list all individual album files
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

        // Save the index for next time (even if empty) to avoid repeating fallback
        await this.s3Repo.uploadFile(bucket, indexKey, encodeText(JSON.stringify(albums)), 'application/octet-stream');

        return albums;
    } catch (e) {
        console.error('Failed to list albums', e);
    }

    return [];
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
            const albums = await this.listAlbums(bucket, email);
            const index = albums.findIndex(a => a.id === album.id);
            if (index >= 0) {
                albums[index] = album;
            } else {
                albums.push(album);
            }
            await this.s3Repo.uploadFile(bucket, this.getAlbumsIndexKey(email), encodeText(JSON.stringify(albums)), 'application/octet-stream');
        } catch (e) {
            console.error('Failed to update albums index after save', e);
        }
    } finally {
        release();
    }
  }

  async deleteAlbum(bucket: string, email: string, albumId: string): Promise<void> {
    const release = await GlobalLock.acquire(`albums-${email}`);
    try {
        const key = this.getAlbumKey(email, albumId);
        await this.s3Repo.deleteFile(bucket, key);

        // Update index
        try {
            const albums = await this.listAlbums(bucket, email);
            const filtered = albums.filter(a => a.id !== albumId);
            await this.s3Repo.uploadFile(bucket, this.getAlbumsIndexKey(email), encodeText(JSON.stringify(filtered)), 'application/octet-stream');
        } catch (e) {
            console.error('Failed to update albums index after delete', e);
        }
    } finally {
        release();
    }
  }
}
