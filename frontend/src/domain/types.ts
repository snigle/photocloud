export interface S3Credentials {
  access: string;
  secret: string;
  endpoint: string;
  region: string;
  bucket: string;
  user_key?: string;
}

export interface Photo {
  key: string;
  url: string;
}
