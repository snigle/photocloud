import axios from 'axios';
import type { IAuthRepository, AuthResponse, S3Credentials } from '../domain/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export class AuthRepository implements IAuthRepository {
  async devLogin(): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/dev`);
    return response.data;
  }

  async googleLogin(token: string): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/google?token=${token}`);
    return response.data;
  }

  async requestMagicLink(email: string): Promise<void> {
    await axios.get(`${API_URL}/auth/magic-link/request?email=${email}`);
  }

  async validateMagicLink(token: string): Promise<AuthResponse> {
    const response = await axios.get(`${API_URL}/auth/magic-link/callback?token=${token}`);
    return response.data;
  }

  async beginPasskeyRegistration(email: string): Promise<any> {
    const response = await axios.get(`${API_URL}/auth/passkey/register/begin?email=${email}`, {
      withCredentials: true
    });
    return response.data;
  }

  async finishPasskeyRegistration(email: string, credential: any): Promise<void> {
    await axios.post(`${API_URL}/auth/passkey/register/finish?email=${email}`, credential, {
      withCredentials: true
    });
  }

  async beginPasskeyLogin(email: string): Promise<any> {
    const response = await axios.get(`${API_URL}/auth/passkey/login/begin?email=${email}`, {
      withCredentials: true
    });
    return response.data;
  }

  async finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse> {
    const response = await axios.post(`${API_URL}/auth/passkey/login/finish?email=${email}`, credential, {
      withCredentials: true
    });
    return response.data;
  }
}
