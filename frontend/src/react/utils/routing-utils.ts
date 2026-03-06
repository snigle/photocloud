import { Platform } from 'react-native';

export const getBaseDir = () => {
  if (Platform.OS !== 'web') return '/';
  const pathname = window.location.pathname;
  if (pathname.endsWith('/')) return pathname;
  return pathname.substring(0, pathname.lastIndexOf('/') + 1);
};

export const getIsStaging = () => {
    try {
        if (Platform.OS !== 'web') return false;
        if (typeof window === 'undefined') return false;
        return window.location.pathname.includes('/staging') || window.location.hostname.includes('staging');
    } catch (e) {
        return false;
    }
};
