export interface S3Credentials {
  access: string;
  secret: string;
  endpoint: string;
  region: string;
  bucket: string;
  user_key: string;
}

export interface Photo {
  key: string;
  url: string;
}

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
  requestMagicLink(email: string): Promise<void>;
  validateMagicLink(token: string): Promise<AuthResponse>;
  beginPasskeyRegistration(email: string): Promise<any>;
  finishPasskeyRegistration(email: string, credential: any): Promise<void>;
  beginPasskeyLogin(email: string): Promise<any>;
  finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse>;
}

export interface IS3Repository {
  listPhotos(bucket: string, prefix: string): Promise<Photo[]>;
}
