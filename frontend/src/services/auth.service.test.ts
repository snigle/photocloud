import { AuthService } from './auth.service';
import axios from 'axios';

jest.mock('axios');
jest.mock('react-native', () => ({
  Platform: { OS: 'web' }
}));
jest.mock('react-native-passkey', () => ({
  Passkey: {
    create: jest.fn(),
    get: jest.fn()
  }
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AuthService', () => {
  it('should call dev login', async () => {
    mockedAxios.get.mockResolvedValue({ data: { access: 'test' } });
    const creds = await AuthService.devLogin();
    expect(creds.access).toBe('test');
    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8080/auth/dev');
  });

  it('should request magic link', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'Email sent' });
    await AuthService.requestMagicLink('test@example.com');
    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8080/auth/magic-link/request?email=test@example.com');
  });
});
