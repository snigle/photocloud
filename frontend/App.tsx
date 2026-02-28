import React, { useEffect, useRef, useMemo } from 'react';
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

export default function App() {
  const { session, loading, login, logout } = useAuth();
  const authUseCase = useMemo(() => new AuthUseCase(authRepo), []);
  const processedTokens = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      console.log('Handling deep link URL:', event.url);
      const parsed = Linking.parse(event.url);
      const { queryParams, path, hostname, scheme } = parsed;
      console.log('Parsed URL details:', { scheme, hostname, path, queryParams });

      // Support token in query params or as the last part of the path
      let token = queryParams?.token as string;
      if (!token && path) {
        const pathParts = path.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.length > 20) { // Tokens are typically long JWTs
          token = lastPart;
        }
      }

      if (token && !processedTokens.current.has(token)) {
        console.log('Validating magic link token:', token.substring(0, 10) + '...');
        processedTokens.current.add(token);
        try {
          const response = await authUseCase.validateMagicLink(token);
          console.log('Magic link validated successfully for:', response.email);
          login(response, response.email);
          // Clear URL params to avoid reload loops
          if (typeof window !== 'undefined' && window.history) {
            const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]token=[^&]+/, '').replace(/^&/, '?');
            window.history.replaceState({}, '', cleanUrl);
          }
        } catch (e) {
          console.error('Failed to validate magic link from URL', e);
          processedTokens.current.delete(token); // Allow retry on failure
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a link
    Linking.getInitialURL().then((url) => {
      console.log('App initial URL:', url);
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
