import type { IAuthRepository, AuthResponse } from '../domain/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
console.log('AuthRepository: API_URL =', API_URL);

export class AuthRepository implements IAuthRepository {
  private async handleError(response: Response, message: string): Promise<never> {
    const body = await response.text().catch(() => 'no body');
    const errorMsg = `${message} (status: ${response.status}, url: ${response.url}, body: ${body})`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  async devLogin(email: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/dev?email=${encodeURIComponent(email)}`);
    if (!response.ok) return await this.handleError(response, 'Failed to dev login');
    return await response.json();
  }

  async googleLogin(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/google?token=${encodeURIComponent(token)}`);
    if (!response.ok) return await this.handleError(response, 'Failed to google login');
    return await response.json();
  }

  async requestMagicLink(email: string, redirectUrl?: string): Promise<void> {
    let url = `${API_URL}/auth/magic-link/request?email=${encodeURIComponent(email)}`;
    if (redirectUrl) {
      url += `&redirect_url=${encodeURIComponent(redirectUrl)}`;
    }
    console.log('AuthRepository: Requesting magic link from', url);
    const response = await fetch(url);
    if (!response.ok) return await this.handleError(response, 'Failed to request magic link');
  }

  async validateMagicLink(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/magic-link/callback?token=${encodeURIComponent(token)}`);
    if (!response.ok) return await this.handleError(response, 'Failed to validate magic link');
    return await response.json();
  }

  async beginPasskeyRegistration(email: string): Promise<any> {
    const response = await fetch(`${API_URL}/auth/passkey/register/begin?email=${encodeURIComponent(email)}`, {
      credentials: 'include'
    });
    if (!response.ok) return await this.handleError(response, 'Failed to begin passkey registration');
    return await response.json();
  }

  async finishPasskeyRegistration(email: string, credential: any): Promise<void> {
    const response = await fetch(`${API_URL}/auth/passkey/register/finish?email=${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
      credentials: 'include'
    });
    if (!response.ok) return await this.handleError(response, 'Failed to finish passkey registration');
  }

  async beginPasskeyLogin(email: string): Promise<any> {
    const response = await fetch(`${API_URL}/auth/passkey/login/begin?email=${encodeURIComponent(email)}`, {
      credentials: 'include'
    });
    if (!response.ok) return await this.handleError(response, 'Failed to begin passkey login');
    return await response.json();
  }

  async finishPasskeyLogin(email: string, credential: any): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/passkey/login/finish?email=${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
      credentials: 'include'
    });
    if (!response.ok) return await this.handleError(response, 'Failed to finish passkey login');
    return await response.json();
  }

  async getVersion(): Promise<string> {
    const response = await fetch(`${API_URL}/version`);
    if (!response.ok) return 'unknown';
    return await response.text();
  }
}
