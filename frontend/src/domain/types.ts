export interface S3Credentials {
  access: string;
  secret: string;
  endpoint: string;
  region: string;
  bucket: string;
}

export interface Photo {
  key: string;
  url: string;
}
