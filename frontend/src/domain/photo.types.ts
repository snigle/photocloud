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
