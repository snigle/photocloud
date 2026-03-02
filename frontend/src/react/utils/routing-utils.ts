import { Platform } from 'react-native';

export const getBaseDir = () => {
  if (Platform.OS !== 'web') return '/';
  const pathname = window.location.pathname;
  const lastSlashIndex = pathname.lastIndexOf('/');
  return pathname.substring(0, lastSlashIndex + 1);
};

export const getRouteFromPath = (pathname: string, base: string) => {
    const route = pathname.substring(base.length);
    return route || 'login';
};
