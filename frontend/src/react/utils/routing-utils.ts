import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

/**
 * Extracts the base directory of the application on web.
 * It identifies the directory containing the app by finding the last slash in the pathname.
 * Following the requirement: relative to the last / before the #.
 */
export const getBaseDir = () => {
  if (Platform.OS !== 'web') return '/';
  const pathname = window.location.pathname;
  const lastSlashIndex = pathname.lastIndexOf('/');
  return pathname.substring(0, lastSlashIndex + 1);
};

/**
 * Extracts the route name from the pathname, relative to the base directory.
 */
export const getRouteFromPath = (pathname: string, base: string) => {
    let route = pathname.substring(base.length).replace(/\/$/, '');
    if (route === 'index.html' || !route) return 'login';
    return route;
};

/**
 * Creates a full URL for a given route, ensuring hash-based routing on web.
 */
export const createAppURL = (route: string) => {
  if (Platform.OS !== 'web') {
    return Linking.createURL(route);
  }
  return `${window.location.origin}${getBaseDir()}#/${route}`;
};
