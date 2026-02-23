import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { PaperProvider, ActivityIndicator, MD3LightTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useAuth } from './src/react/hooks/useAuth';
import AuthScreen from './src/react/screens/AuthScreen';
import GalleryScreen from './src/react/screens/GalleryScreen';
import { AuthRepository } from './src/infra/auth.repository';
import { AuthUseCase } from './src/usecase/auth.usecase';

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
const authUseCase = new AuthUseCase(authRepo);

export default function App() {
  const { session, loading, login, logout } = useAuth();

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { queryParams } = Linking.parse(event.url);
      if (queryParams?.token) {
        try {
          const response = await authUseCase.validateMagicLink(queryParams.token as string);
          login(response, response.email);
          // Clear URL params to avoid reload loops
          if (typeof window !== 'undefined' && window.history) {
            window.history.replaceState({}, '', '/');
          }
        } catch (e) {
          console.error('Failed to validate magic link from URL', e);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.remove();
    };
  }, [authUseCase, login]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <StatusBar style="auto" />
      <View style={styles.container}>
        {session ? (
          <GalleryScreen
            creds={session.creds}
            email={session.email}
            onLogout={logout}
          />
        ) : (
          <AuthScreen onLogin={login} authUseCase={authUseCase} />
        )}
      </View>
    </PaperProvider>
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
