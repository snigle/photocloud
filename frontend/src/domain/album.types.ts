import { UploadedPhoto } from './photo.types';

export interface Album {
  id: string;
  title: string;
  photoKeys?: string[];
  photoCount?: number;
  coverPhotoKey?: string;
  order: 'date-asc' | 'date-desc' | 'manual';
  createdAt: number;
  updatedAt: number;
  sharedWith?: string[];
  ownerEmail?: string;
  shareKey?: string;
  albumKey?: string;
}

export interface IAlbumRepository {
  listAlbums(bucket: string, email: string, skipCache?: boolean): Promise<Album[]>;
  getAlbum(bucket: string, email: string, albumId: string): Promise<Album>;
  saveAlbum(bucket: string, email: string, album: Album): Promise<void>;
  deleteAlbum(bucket: string, email: string, albumId: string): Promise<void>;
  shareAlbum(bucket: string, email: string, albumId: string, shareEmail: string): Promise<Album>;
  listPhotos(bucket: string, email: string, albumId: string): Promise<UploadedPhoto[]>;
}
