import { UploadedPhoto } from './photo.types';

export interface IS3Repository {
  listPhotos(bucket: string, email: string): Promise<UploadedPhoto[]>;
  getCloudIndex(bucket: string, email: string): Promise<{ years: { year: string, count: number }[] }>;
  uploadFile(
    bucket: string,
    key: string,
    data: Uint8Array,
    contentType: string,
    customSSEKey?: string | null
  ): Promise<void>;
  getFile(bucket: string, key: string, customSSEKey?: string | null): Promise<Uint8Array>;
  getDownloadUrl(bucket: string, key: string, customSSEKey?: string | null): Promise<string>;
  exists(bucket: string, key: string, customSSEKey?: string | null): Promise<boolean>;
  deleteFile(bucket: string, key: string): Promise<void>;
  deleteFolder(bucket: string, prefix: string): Promise<void>;
  listKeys(bucket: string, prefix: string, delimiter?: string): Promise<string[]>;
  listFolders(bucket: string, prefix: string): Promise<string[]>;
  copyObject(
    bucket: string,
    sourceKey: string,
    destKey: string,
    sourceSSEKey?: string | null,
    destSSEKey?: string | null
  ): Promise<void>;
}
