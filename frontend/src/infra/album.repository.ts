import type { IAlbumRepository, Album, IS3Repository } from '../domain/types';
import { encodeText, decodeText } from './utils';

export class AlbumRepository implements IAlbumRepository {
  private s3Repo: IS3Repository;

  constructor(s3Repo: IS3Repository) {
    this.s3Repo = s3Repo;
  }

  private getAlbumKey(email: string, albumId: string): string {
    return `users/${email}/albums/${albumId}.json`;
  }

  async listAlbums(bucket: string, email: string): Promise<Album[]> {
    const prefix = `users/${email}/albums/`;
    const albums: Album[] = [];

    try {
        const keys = await this.s3Repo.listKeys(bucket, prefix);
        const albumsData = await Promise.all(keys.filter(k => k.endsWith('.json')).map(async (key) => {
            try {
                const data = await this.s3Repo.getFile(bucket, key);
                return JSON.parse(decodeText(data)) as Album;
            } catch (e) {
                console.error(`Failed to load album data for key ${key}`, e);
                return null;
            }
        }));

        return albumsData.filter((a): a is Album => a !== null);
    } catch (e) {
        console.error('Failed to list albums', e);
    }

    return albums;
  }

  async getAlbum(bucket: string, email: string, albumId: string): Promise<Album> {
    const key = this.getAlbumKey(email, albumId);
    const data = await this.s3Repo.getFile(bucket, key);
    return JSON.parse(decodeText(data));
  }

  async saveAlbum(bucket: string, email: string, album: Album): Promise<void> {
    const key = this.getAlbumKey(email, album.id);
    const data = encodeText(JSON.stringify(album));
    await this.s3Repo.uploadFile(bucket, key, data, 'application/json');
  }

  async deleteAlbum(bucket: string, email: string, albumId: string): Promise<void> {
    const key = this.getAlbumKey(email, albumId);
    await this.s3Repo.deleteFile(bucket, key);
  }
}
