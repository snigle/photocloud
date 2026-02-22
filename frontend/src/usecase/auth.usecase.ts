import { Platform } from 'react-native';
import { Passkey } from 'react-native-passkey';
import type { IAuthRepository, AuthResponse } from '../domain/types';

export class AuthUseCase {
  constructor(private authRepo: IAuthRepository) {}

  async loginWithDev(): Promise<AuthResponse> {
    return await this.authRepo.devLogin();
  }

  async loginWithGoogle(token: string): Promise<AuthResponse> {
    return await this.authRepo.googleLogin(token);
  }

  async requestMagicLink(email: string): Promise<void> {
    await this.authRepo.requestMagicLink(email);
  }

  async validateMagicLink(token: string): Promise<AuthResponse> {
    return await this.authRepo.validateMagicLink(token);
  }

  async registerPasskey(email: string): Promise<void> {
    const options = await this.authRepo.beginPasskeyRegistration(email);

    let credential;
    if (Platform.OS === 'web') {
      credential = await (navigator.credentials.create as any)({
        publicKey: this.prepareOptions(options)
      });
      credential = this.transformCredential(credential);
    } else {
      credential = await Passkey.create(options);
    }

    await this.authRepo.finishPasskeyRegistration(email, credential);
  }

  async loginWithPasskey(email: string): Promise<AuthResponse> {
    const options = await this.authRepo.beginPasskeyLogin(email);

    let credential;
    if (Platform.OS === 'web') {
      credential = await (navigator.credentials.get as any)({
        publicKey: this.prepareOptions(options)
      });
      credential = this.transformCredential(credential);
    } else {
      credential = await Passkey.get(options);
    }

    return await this.authRepo.finishPasskeyLogin(email, credential);
  }

  private prepareOptions(options: any) {
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

  private bufferFromBase64(base64: string) {
    return Uint8Array.from(atob(base64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }

  private transformCredential(cred: any) {
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

  private base64FromBuffer(buffer: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
