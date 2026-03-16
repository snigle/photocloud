import { Photo, LocalPhoto } from './photo.types';

export interface Folder {
  id: string;
  title: string;
  count: number;
  lastPhoto?: Photo;
}

export interface ILocalGalleryRepository {
  listLocalPhotos(): Promise<LocalPhoto[]>;
  listFolders(): Promise<Folder[]>;
  getPhotosByFolder(folderId: string, limit?: number): Promise<LocalPhoto[]>;
  saveToCache(photos: Photo[]): Promise<void>;
  savePhoto(photo: Photo): Promise<void>;
  loadFromCache(limit?: number, offset?: number): Promise<Photo[]>;
  existsById(id: string): Promise<boolean>;
  countPhotos(): Promise<number>;
  markAsUploaded(localId: string, cloudId: string): Promise<void>;
  getUploadedLocalIds(): Promise<Set<string>>;
  deleteFromCache(id: string): Promise<void>;
}
