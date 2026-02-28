import { AuthRepository } from '../auth.repository';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' }
}));
jest.mock('react-native-passkey', () => ({
  Passkey: {
    create: jest.fn(),
    get: jest.fn()
  }
}));

describe('AuthRepository', () => {
  const authRepo = new AuthRepository();
  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('should call dev login', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access: 'test', email: 'dev@test.local' })
    });

    const response = await authRepo.devLogin();
    expect(response.access).toBe('test');
    expect(response.email).toBe('dev@test.local');
    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/auth/dev`);
  });

  it('should request magic link', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true
    });

    await authRepo.requestMagicLink('test@example.com');
    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/auth/magic-link/request?email=test@example.com`);
  });

  it('should request magic link with redirect url', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true
    });

    const redirectUrl = 'photocloud://callback';
    await authRepo.requestMagicLink('test@example.com', redirectUrl);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_URL}/auth/magic-link/request?email=test@example.com&redirect_url=${encodeURIComponent(redirectUrl)}`
    );
  });

  it('should throw error on failed login', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false
    });

    await expect(authRepo.devLogin()).rejects.toThrow('Failed to dev login');
  });
});
