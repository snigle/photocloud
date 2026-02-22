import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { S3Credentials, UserSession } from '../domain/types';

const SESSION_KEY = '@photocloud_session';

export const useAuth = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const stored = await AsyncStorage.getItem(SESSION_KEY);
      if (stored) {
        setSession(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load session', e);
    } finally {
      setLoading(false);
    }
  };

  const login = async (creds: S3Credentials, email: string) => {
    const newSession = { creds, email };
    setSession(newSession);
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch (e) {
      console.error('Failed to save session', e);
    }
  };

  const logout = async () => {
    setSession(null);
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error('Failed to remove session', e);
    }
  };

  return { session, loading, login, logout };
};
