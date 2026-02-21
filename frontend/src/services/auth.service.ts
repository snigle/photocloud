import axios from 'axios';
import type { S3Credentials } from '../domain/types';

const API_URL = 'http://localhost:8080';

export class AuthService {
  static async devLogin(): Promise<S3Credentials> {
    const response = await axios.get(`${API_URL}/auth/dev`);
    return response.data;
  }

  static async googleLogin(token: string): Promise<S3Credentials> {
    const response = await axios.get(`${API_URL}/auth/google?token=${token}`);
    return response.data;
  }
}
