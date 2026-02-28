export interface S3Credentials {
  access: string;
  secret: string;
  endpoint: string;
  region: string;
  bucket: string;
  user_key: string;
}

export interface BasePhoto {
  id: string;
  creationDate: number; // timestamp in seconds
  size: number;
  width: number;
  height: number;
}

export interface LocalPhoto extends BasePhoto {
  uri: string;
  type: 'local';
}

export interface UploadedPhoto extends BasePhoto {
  key: string;
  type: 'cloud';
}

export type Photo = LocalPhoto | UploadedPhoto;

export interface UserSession {
  creds: S3Credentials;
  email: string;
}

export interface AuthResponse extends S3Credentials {
  email: string;
}

export interface IAuthRepository {
  devLogin(): Promise<AuthResponse>;
  googleLogin(token: string): Promise<AuthResponse>;
  requestMagicLink(email: string, redirectUrl?: string): Promise<void>;
  validateMagicLink(token: string): Promise<AuthResponse>;
  beginPasskeyRegistration(email: string): Promise<any>;
  finishPasskeyRegistration(email: string, credential: any): Promise<void>;
  beginPasskeyLogin(email: string): Promise<any>;
  finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse>;
  getVersion(): Promise<string>;
}

export interface IS3Repository {
  listPhotos(bucket: string, email: string): Promise<UploadedPhoto[]>;
  getCloudIndex(bucket: string, email: string): Promise<{ years: { year: string, count: number }[] }>;
  uploadFile(
    bucket: string,
    key: string,
    data: Uint8Array,
    contentType: string
  ): Promise<void>;
  getFile(bucket: string, key: string): Promise<Uint8Array>;
  getDownloadUrl(bucket: string, key: string): Promise<string>;
  exists(bucket: string, key: string): Promise<boolean>;
  deleteFile(bucket: string, key: string): Promise<void>;
}

export interface ILocalGalleryRepository {
  listLocalPhotos(): Promise<LocalPhoto[]>;
  saveToCache(photos: Photo[]): Promise<void>;
  savePhoto(photo: Photo): Promise<void>;
  loadFromCache(limit?: number, offset?: number): Promise<Photo[]>;
  existsById(id: string): Promise<boolean>;
  countPhotos(): Promise<number>;
  markAsUploaded(localId: string, cloudId: string): Promise<void>;
  getUploadedLocalIds(): Promise<Set<string>>;
  deleteFromCache(id: string): Promise<void>;
}
