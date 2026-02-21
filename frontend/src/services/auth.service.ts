import axios from 'axios';
import { Platform } from 'react-native';
import { Passkey } from 'react-native-passkey';
import type { S3Credentials } from '../domain/types';

// In a real Expo app, use Constants.expoConfig.extra.apiUrl or similar
const API_URL = 'http://localhost:8080';

export interface AuthResponse extends S3Credentials {
  email: string;
}

export class AuthService {
  static async devLogin(): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/dev`);
    return response.data;
  }

  static async googleLogin(token: string): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/google?token=${token}`);
    return response.data;
  }

  static async requestMagicLink(email: string): Promise<void> {
    await axios.get(`${API_URL}/auth/magic-link/request?email=${email}`);
  }

  static async validateMagicLink(token: string): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/magic-link/callback?token=${token}`);
    return response.data;
  }

  static async beginPasskeyRegistration(email: string): Promise<any> {
    const response = await axios.get(`${API_URL}/auth/passkey/register/begin?email=${email}`, {
      withCredentials: true
    });
    return response.data;
  }

  static async finishPasskeyRegistration(email: string, credential: any): Promise<void> {
    await axios.post(`${API_URL}/auth/passkey/register/finish?email=${email}`, credential, {
      withCredentials: true
    });
  }

  static async beginPasskeyLogin(email: string): Promise<any> {
    const response = await axios.get(`${API_URL}/auth/passkey/login/begin?email=${email}`, {
      withCredentials: true
    });
    return response.data;
  }

  static async finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse> {
    const response = await axios.post(`${API_URL}/auth/passkey/login/finish?email=${email}`, credential, {
      withCredentials: true
    });
    return response.data;
  }

  static async passkeyRegister(email: string): Promise<void> {
    const options = await this.beginPasskeyRegistration(email);

    let credential;
    if (Platform.OS === 'web') {
      credential = await (navigator.credentials.create as any)({
        publicKey: this.prepareOptions(options)
      });
      credential = this.transformCredential(credential);
    } else {
      credential = await Passkey.create(options);
    }

    await this.finishPasskeyRegistration(email, credential);
  }

  static async passkeyLogin(email: string): Promise<AuthResponse> {
    const options = await this.beginPasskeyLogin(email);

    let credential;
    if (Platform.OS === 'web') {
      credential = await (navigator.credentials.get as any)({
        publicKey: this.prepareOptions(options)
      });
      credential = this.transformCredential(credential);
    } else {
      credential = await Passkey.get(options);
    }

    return await this.finishPasskeyLogin(email, credential);
  }

  private static prepareOptions(options: any) {
    const newOptions = { ...options };
    if (newOptions.challenge) newOptions.challenge = this.bufferFromBase64(newOptions.challenge);
    if (newOptions.user?.id) newOptions.user.id = this.bufferFromBase64(newOptions.user.id);
    if (newOptions.allowCredentials) {
      newOptions.allowCredentials = newOptions.allowCredentials.map((c: any) => ({
        ...c,
        id: this.bufferFromBase64(c.id)
      }));
    }
    return newOptions;
  }

  private static bufferFromBase64(base64: string) {
    return Uint8Array.from(atob(base64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }

  private static transformCredential(cred: any) {
    return {
      id: cred.id,
      rawId: this.base64FromBuffer(cred.rawId),
      type: cred.type,
      response: {
        attestationObject: cred.response.attestationObject ? this.base64FromBuffer(cred.response.attestationObject) : undefined,
        clientDataJSON: this.base64FromBuffer(cred.response.clientDataJSON),
        authenticatorData: cred.response.authenticatorData ? this.base64FromBuffer(cred.response.authenticatorData) : undefined,
        signature: cred.response.signature ? this.base64FromBuffer(cred.response.signature) : undefined,
        userHandle: cred.response.userHandle ? this.base64FromBuffer(cred.response.userHandle) : undefined,
      }
    };
  }

  private static base64FromBuffer(buffer: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
