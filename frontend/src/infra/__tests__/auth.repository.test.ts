import { AuthRepository } from '../auth.repository';
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

describe('AuthRepository', () => {
  const authRepo = new AuthRepository();

  it('should call dev login', async () => {
    mockedAxios.get.mockResolvedValue({ data: { access: 'test', email: 'dev@test.local' } });
    const response = await authRepo.devLogin();
    expect(response.access).toBe('test');
    expect(response.email).toBe('dev@test.local');
    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8080/auth/dev');
  });

  it('should request magic link', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'Email sent' });
    await authRepo.requestMagicLink('test@example.com');
    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8080/auth/magic-link/request?email=test@example.com');
  });
});
