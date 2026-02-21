import React, { useState } from 'react';
import { AuthService } from '../services/auth.service';
import type { S3Credentials } from '../domain/types';

interface Props {
  onLogin: (creds: S3Credentials, email: string) => void;
}

const AuthScreen: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDevLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const creds = await AuthService.devLogin();
      onLogin(creds, 'dev@photocloud.local');
    } catch (err: any) {
      setError('Failed to login via Dev Auth. Make sure the API is running with DEV_AUTH_ENABLED=true');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Photo Cloud</h1>
      <p>Low-cost photo storage</p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ marginTop: '20px' }}>
        <button
          onClick={handleDevLogin}
          disabled={loading}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        >
          {loading ? 'Logging in...' : 'Login with Dev Account'}
        </button>
      </div>

      <div style={{ marginTop: '20px', color: '#666' }}>
        <small>Google, Magic Link, and Passkeys coming soon to this UI</small>
      </div>
    </div>
  );
};

export default AuthScreen;
