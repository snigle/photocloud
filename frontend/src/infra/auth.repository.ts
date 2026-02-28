import type { IAuthRepository, AuthResponse } from '../domain/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export class AuthRepository implements IAuthRepository {
  async devLogin(): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/dev`);
    if (!response.ok) throw new Error('Failed to dev login');
    return await response.json();
  }

  async googleLogin(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/google?token=${token}`);
    if (!response.ok) throw new Error('Failed to google login');
    return await response.json();
  }

  async requestMagicLink(email: string): Promise<void> {
    const response = await fetch(`${API_URL}/auth/magic-link/request?email=${email}`);
    if (!response.ok) throw new Error('Failed to request magic link');
  }

  async validateMagicLink(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/magic-link/callback?token=${token}`);
    if (!response.ok) throw new Error('Failed to validate magic link');
    return await response.json();
  }

  async beginPasskeyRegistration(email: string): Promise<any> {
    const response = await fetch(`${API_URL}/auth/passkey/register/begin?email=${email}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to begin passkey registration');
    return await response.json();
  }

  async finishPasskeyRegistration(email: string, credential: any): Promise<void> {
    const response = await fetch(`${API_URL}/auth/passkey/register/finish?email=${email}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to finish passkey registration');
  }

  async beginPasskeyLogin(email: string): Promise<any> {
    const response = await fetch(`${API_URL}/auth/passkey/login/begin?email=${email}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to begin passkey login');
    return await response.json();
  }

  async finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/passkey/login/finish?email=${email}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to finish passkey login');
    return await response.json();
  }

  async getVersion(): Promise<string> {
    const response = await fetch(`${API_URL}/version`);
    if (!response.ok) return 'unknown';
    return await response.text();
  }
}
