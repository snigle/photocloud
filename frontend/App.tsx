import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, ActivityIndicator, MD3LightTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer, getStateFromPath, getPathFromState } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as BackgroundFetch from 'expo-background-fetch';

import { useAuth } from './src/react/hooks/useAuth';
import AuthScreen from './src/react/screens/AuthScreen';
import GalleryScreen from './src/react/screens/GalleryScreen';
import FoldersScreen from './src/react/screens/FoldersScreen';
import { AuthRepository } from './src/infra/auth.repository';
import { AuthUseCase } from './src/usecase/auth.usecase';
import { BACKGROUND_SYNC_TASK } from './src/domain/constants';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#005bbb', // OVHcloud Blue
    secondary: '#001932', // OVHcloud Dark Blue
    background: '#ffffff',
    surface: '#ffffff',
  },
};

const authRepo = new AuthRepository();

const linking = {
  prefixes: [Linking.createURL('/'), 'photocloud://', 'https://photocloud.ovh'],
  config: {
    screens: {
      Auth: 'login',
      App: {
        screens: {
          Gallery: 'gallery',
          Dossiers: 'folders',
        }
      },
    },
  },
  getStateFromPath: (path: string, options: any) => {
    if (Platform.OS === 'web') {
      const hash = window.location.hash.replace(/^#\/?/, '');
      const search = window.location.search;
      // Combine hash path and search params so tokens are parsed
      let fullPath = hash || 'login';
      if (search && !fullPath.includes('?')) {
        fullPath += search;
      }
      return getStateFromPath(fullPath, options);
    }
    return getStateFromPath(path, options);
  },
  getPathFromState: (state: any, options: any) => {
    const path = getPathFromState(state, options);
    if (Platform.OS === 'web') {
      // Ensure we always have /#/path
      return `/#/${path.replace(/^\//, '')}`;
    }
    return path;
  },
};

export default function App() {
  const { session, loading, login, logout } = useAuth();

  if (Platform.OS === 'web' && window.location.pathname !== '/') {
      const hash = window.location.hash;
      const search = window.location.search;
      const path = window.location.pathname;
      const newUrl = `${window.location.origin}/#${path}${search}${hash}`;
      console.log('App: Redirecting to hash URL:', newUrl);
      // Use replaceState to change the URL without a full reload,
      // which allows the NavigationContainer to pick up the new state.
      window.history.replaceState(null, '', newUrl);
  }

  const authUseCase = useMemo(() => new AuthUseCase(authRepo), []);
  const processedTokens = useRef(new Set<string>());

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      console.log('App: Handling deep link:', url);
      const parsed = Linking.parse(url);
      const token = (parsed.queryParams?.token as string);

      if (token && token !== 'login' && !processedTokens.current.has(token)) {
          processedTokens.current.add(token);
          console.log('App: Validating token from deep link...');
          try {
              const res = await authUseCase.validateMagicLink(token);
              login(res, res.email);
          } catch (err) {
              console.error('App: Failed to validate magic link from deep link:', err);
          }
      }
    };

    // Initial check for initial URL
    Linking.getInitialURL().then((url) => {
        if (url) handleDeepLink(url);
    });

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', (event) => {
        handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, [authUseCase, login]);

  useEffect(() => {
    if (session && Platform.OS !== 'web') {
        BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 15 * 60, // 15 minutes
            stopOnTerminate: false,
            startOnBoot: true,
        }).catch(err => console.error('Failed to register background task', err));
    }
  }, [session]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <View style={styles.container}>
            <NavigationContainer linking={linking}>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                    {session ? (
                        <Stack.Screen name="App">
                            {() => (
                                <Drawer.Navigator
                                    initialRouteName="Gallery"
                                    screenOptions={{
                                        headerShown: false,
                                        drawerActiveTintColor: theme.colors.primary,
                                    }}
                                >
                                    <Drawer.Screen name="Gallery">
                                        {(props) => (
                                            <GalleryScreen
                                                {...props}
                                                creds={session.creds}
                                                email={session.email}
                                                onLogout={logout}
                                                onMenu={() => (props.navigation as any).openDrawer()}
                                            />
                                        )}
                                    </Drawer.Screen>
                                    <Drawer.Screen name="Dossiers" component={FoldersScreen} />
                                </Drawer.Navigator>
                            )}
                        </Stack.Screen>
                    ) : (
                        <Stack.Screen name="Auth">
                            {(props) => <AuthScreen {...props} onLogin={login} authUseCase={authUseCase} />}
                        </Stack.Screen>
                    )}
                </Stack.Navigator>
            </NavigationContainer>
        </View>
        </PaperProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
