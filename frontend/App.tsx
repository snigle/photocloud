import React, { useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { StyleSheet, View, Platform, Text, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, ActivityIndicator, MD3LightTheme, Button } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer, getStateFromPath, getPathFromState } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as BackgroundFetch from 'expo-background-fetch';

import { useAuth } from './src/react/hooks/useAuth';
import { getBaseDir, getIsStaging } from './src/react/utils/routing-utils';
import AuthScreen from './src/react/screens/AuthScreen';
import GalleryScreen from './src/react/screens/GalleryScreen';
import FoldersScreen from './src/react/screens/FoldersScreen';
import AlbumsScreen from './src/react/screens/AlbumsScreen';
import AlbumDetailScreen from './src/react/screens/AlbumDetailScreen';
import { AuthRepository } from './src/infra/auth.repository';
import { AuthUseCase } from './src/usecase/auth.usecase';
import { BACKGROUND_SYNC_TASK } from './src/domain/constants';
import { S3Repository } from './src/infra/s3.repository';

const AppContext = createContext<any>(null);
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const isStaging = getIsStaging();

const APP_THEME = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: isStaging ? '#e65100' : '#005bbb',
    secondary: '#001932',
    background: '#ffffff',
    surface: '#ffffff',
  },
};

const authRepo = new AuthRepository();

const linking = {
  prefixes: [
    Linking.createURL('/'),
    'photocloud://',
    'https://photocloud.ovh',
    ...(Platform.OS === 'web' ? [window.location.origin + getBaseDir()] : [])
  ],
  config: {
    screens: {
      Auth: 'login',
      App: {
        path: '',
        screens: {
          Gallery: 'gallery',
          Dossiers: 'folders',
          Albums: 'albums',
        }
      },
      AlbumDetail: 'albums/:albumId',
    },
  },
  getStateFromPath: (path: string, options: any) => {
    let state: any;
    try {
        if (Platform.OS === 'web') {
          const hash = window.location.hash.replace(/^#\/?/, '');
          const search = window.location.search;
          let fullPath = hash || 'login';
          if (search && !fullPath.includes('?')) {
            fullPath += search;
          }
          state = getStateFromPath(fullPath, options);
        } else {
          state = getStateFromPath(path, options);
        }
    } catch (e) {
        console.error('getStateFromPath error', e);
    }

    const fixParams = (s: any): any => {
      if (!s) return s;
      return {
        ...s,
        routes: s.routes?.map((r: any) => {
          const route: any = {
            ...r,
            params: r.params || {},
          };
          if (r.state) {
            route.state = fixParams(r.state);
          }
          return route;
        }) || []
      };
    };

    const finalState = fixParams(state);
    if (!finalState?.routes || finalState.routes.length === 0) {
        return { routes: [{ name: 'Auth', params: {} }] };
    }
    return finalState;
  },
  getPathFromState: (state: any, options: any) => {
    const path = getPathFromState(state, options);
    return Platform.OS === 'web' ? getBaseDir() + '#' + path : path;
  },
};

// Static Wrappers to avoid re-renders and param loss
const GalleryWrapper = (props: any) => {
  const { session, logout } = useContext(AppContext);
  if (!session) return null;
  return (
    <GalleryScreen
      {...props}
      creds={session.creds}
      email={session.email}
      onLogout={logout}
      onMenu={() => (props.navigation as any).openDrawer()}
    />
  );
};

const AlbumsWrapper = (props: any) => {
  const { session } = useContext(AppContext);
  if (!session) return null;
  return <AlbumsScreen {...props} creds={session.creds} email={session.email} />;
};

const AlbumDetailWrapper = (props: any) => {
  const { session } = useContext(AppContext);
  if (!session) return null;
  return <AlbumDetailScreen {...props} creds={session.creds} email={session.email} />;
};

const AuthWrapper = (props: any) => {
  const { login, authUseCase } = useContext(AppContext);
  return <AuthScreen {...props} onLogin={login} authUseCase={authUseCase} />;
};

const MainDrawerNavigator = () => {
  const { renderDrawerContent } = useContext(AppContext);
  return (
    <Drawer.Navigator
      initialRouteName="Gallery"
      drawerContent={renderDrawerContent}
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: APP_THEME.colors.primary,
        headerStyle: {
          backgroundColor: isStaging ? '#fff3e0' : undefined,
        }
      }}
    >
      <Drawer.Screen name="Gallery" component={GalleryWrapper} initialParams={{}} />
      <Drawer.Screen name="Albums" component={AlbumsWrapper} initialParams={{}} />
      <Drawer.Screen name="Dossiers" component={FoldersScreen} initialParams={{}} />
    </Drawer.Navigator>
  );
};

export default function App() {
  const { session, loading, login, logout } = useAuth();
  const [backendVersion, setBackendVersion] = React.useState('...');
  const authUseCase = useMemo(() => new AuthUseCase(authRepo), []);

  useEffect(() => {
    authUseCase.getVersion().then(setBackendVersion).catch(() => setBackendVersion('err'));
  }, [authUseCase]);

  const processedTokens = useRef(new Set<string>());

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      console.log('App: Received deep link:', url);
      const parsed = Linking.parse(url);
      console.log('App: Parsed URL:', JSON.stringify(parsed, null, 2));

      let token = (parsed.queryParams?.token as string);

      // Fallback for cases where Linking.parse might miss the token in complex URLs
      if (!token && url.includes('token=')) {
        const match = url.match(/[?&]token=([^&#]+)/);
        if (match) {
          token = match[1];
          console.log('App: Token extracted via fallback regex:', token);
        }
      }

      if (token && token !== 'login' && !processedTokens.current.has(token)) {
        console.log('App: Validating token:', token);
        processedTokens.current.add(token);
        try {
          const res = await authUseCase.validateMagicLink(token);
          console.log('App: Token validated successfully for', res.email);
          login(res, res.email);
        } catch (err) {
          console.error('App: Magic link validation failed', err);
        }
      } else if (!token) {
          console.log('App: No token found in URL');
      }
    };
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const subscription = Linking.addEventListener('url', (event) => { handleDeepLink(event.url); });
    return () => subscription.remove();
  }, [authUseCase, login]);

  const renderDrawerContent = useCallback((props: any) => {
    const isDev = session?.email === 'dev@photocloud.local' || session?.email === 'dev2@photocloud.local';

    const handleRegisterPasskey = async () => {
      if (!session) return;
      try {
        await authUseCase.registerPasskey(session.email);
        Alert.alert('Succès', 'Passkey enregistrée avec succès !');
      } catch (err: any) {
        Alert.alert('Erreur', 'Échec : ' + err.message);
      }
    };

    const handleClearDev = async () => {
      if (!session || !isDev) return;
      const performClear = async () => {
        try {
          const s3 = new S3Repository(session.creds);
          const prefix = `users/${session.email}/`;
          const keys = await s3.listKeys(session.creds.bucket, prefix);
          for (const key of keys) await s3.deleteFile(session.creds.bucket, key);
          logout();
        } catch (err) {
          Alert.alert('Erreur', 'Impossible de nettoyer : ' + (err as any).message);
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm('Nettoyer le compte de dev ?')) await performClear();
      } else {
        Alert.alert('Nettoyer compte Dev', 'Confirmer ?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: performClear }
        ]);
      }
    };

    return (
      <View style={{ flex: 1 }}>
        <DrawerContentScrollView {...props}>
          <DrawerItemList {...props} />
          <Button icon="fingerprint" mode="text" onPress={handleRegisterPasskey} style={{ marginTop: 10, marginHorizontal: 10 }} contentStyle={{ justifyContent: 'flex-start' }}>
            Enregistrer Passkey
          </Button>
          {isDev && (
            <Button icon="delete-forever" mode="text" textColor={APP_THEME.colors.error} onPress={handleClearDev} style={{ marginTop: 10, marginHorizontal: 10 }} contentStyle={{ justifyContent: 'flex-start' }}>
              Nettoyer compte Dev
            </Button>
          )}
        </DrawerContentScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee', opacity: 0.5 }}>
          <Text style={{ fontSize: 10 }}>v-front: {process.env.EXPO_PUBLIC_VERSION || 'dev'}</Text>
          <Text style={{ fontSize: 10 }}>v-back: {backendVersion}</Text>
          {isStaging && <Text style={{ fontSize: 10, color: '#e65100', fontWeight: 'bold' }}>STAGING</Text>}
        </View>
      </View>
    );
  }, [backendVersion, authUseCase, session, logout]);

  useEffect(() => {
    if (session && Platform.OS !== 'web') {
      BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      }).catch(err => console.error('Failed to register background task', err));
    }
  }, [session]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={APP_THEME.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppContext.Provider value={{ session, login, logout, authUseCase, renderDrawerContent, isStaging }}>
        <PaperProvider theme={APP_THEME}>
          <StatusBar style="auto" />
          <View style={styles.container}>
            <NavigationContainer linking={linking}>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session ? (
                  <Stack.Screen name="Auth" component={AuthWrapper} initialParams={{}} />
                ) : (
                  <>
                    <Stack.Screen name="App" component={MainDrawerNavigator} initialParams={{}} />
                    <Stack.Screen name="AlbumDetail" component={AlbumDetailWrapper} initialParams={{}} />
                  </>
                )}
              </Stack.Navigator>
            </NavigationContainer>
          </View>
        </PaperProvider>
      </AppContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
