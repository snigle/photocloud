import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, ActivityIndicator, MD3LightTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';
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
};

export default function App() {
  const { session, loading, login, logout } = useAuth();
  const authUseCase = useMemo(() => new AuthUseCase(authRepo), []);

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
