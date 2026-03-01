import { Platform } from 'react-native';

const knownRoutes = ['login', 'gallery', 'folders'];

export const getBaseDir = () => {
  if (Platform.OS !== 'web') return '/';
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(Boolean);

  // If the last part is a known route, strip it to get the base directory
  // We use a loop in case there are multiple nested known routes (unlikely but safer)
  while (parts.length > 0 && knownRoutes.includes(parts[parts.length - 1])) {
    parts.pop();
  }

  // Reconstruct base path, ensuring it starts and ends with /
  const base = '/' + (parts.length > 0 ? parts.join('/') + '/' : '');
  return base;
};

export const getRouteFromPath = (pathname: string, base: string) => {
    const normalizedPath = pathname.replace(/\/$/, '');
    const normalizedBase = base.replace(/\/$/, '');

    if (normalizedPath === normalizedBase) return 'login';

    const parts = normalizedPath.split('/');
    const lastPart = parts[parts.length - 1];

    if (knownRoutes.includes(lastPart)) {
        return lastPart;
    }

    return 'login';
};
