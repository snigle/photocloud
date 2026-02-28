import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, Title, Paragraph, ActivityIndicator, Divider, useTheme, HelperText } from 'react-native-paper';
import { Mail, Chrome, Code, Fingerprint } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { S3Credentials } from '../../domain/types';
import type { AuthUseCase } from '../../usecase/auth.usecase';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onLogin: (creds: S3Credentials, email: string) => void;
  authUseCase: AuthUseCase;
}

const AuthScreen: React.FC<Props> = ({ onLogin, authUseCase }) => {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendVersion, setBackendVersion] = useState<string>('...');

  useEffect(() => {
    authUseCase.getVersion().then(setBackendVersion).catch(() => setBackendVersion('error'));
  }, [authUseCase]);

  // Google Auth
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        handleGoogleLogin(authentication.accessToken);
      }
    }
  }, [response]);

  const handleGoogleLogin = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authUseCase.loginWithGoogle(token);
      onLogin(res, res.email);
    } catch (err) {
      setError('Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      setError('Please enter your email first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authUseCase.loginWithPasskey(email);
      onLogin(res, res.email);
    } catch (err: any) {
      console.error(err);
      setError('Passkey login failed. Have you registered a passkey?');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyRegister = async () => {
    if (!email) {
      setError('Please enter your email first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authUseCase.registerPasskey(email);
      setError('Passkey registered successfully! You can now login with it.');
    } catch (err: any) {
      console.error(err);
      setError('Passkey registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authUseCase.loginWithDev();
      onLogin(res, res.email);
    } catch (err) {
      setError('Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLinkRequest = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await authUseCase.requestMagicLink(email);
      setMagicLinkSent(true);
    } catch (err) {
      setError('Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Title style={styles.appTitle}>Photo Cloud</Title>
          <Paragraph style={styles.appSubtitle}>Your low-cost private photo gallery</Paragraph>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Title>Welcome Back</Title>
            <Paragraph style={{ marginBottom: 20 }}>Sign in to access your photos</Paragraph>

            {error && (
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
            )}

            {!magicLinkSent ? (
              <>
                <TextInput
                  label="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  left={<TextInput.Icon icon={() => <Mail size={20} color={theme.colors.primary} />} />}
                  style={styles.input}
                />
                <Button
                  mode="contained"
                  onPress={handleMagicLinkRequest}
                  loading={loading}
                  disabled={loading || !email}
                  style={styles.button}
                >
                  Send Magic Link
                </Button>
                <Button
                  mode="outlined"
                  onPress={handlePasskeyLogin}
                  loading={loading}
                  disabled={loading || !email}
                  icon={() => <Fingerprint size={20} color={theme.colors.primary} />}
                  style={styles.secondaryButton}
                >
                  Sign in with Passkey
                </Button>
                <Button
                  mode="text"
                  onPress={handlePasskeyRegister}
                  loading={loading}
                  disabled={loading || !email}
                  style={{ marginTop: 4 }}
                >
                  Register new Passkey
                </Button>
              </>
            ) : (
              <View style={styles.sentContainer}>
                <Text style={styles.sentText}>Magic link sent to {email}!</Text>
                <Button onPress={() => setMagicLinkSent(false)}>Change Email</Button>
              </View>
            )}

            <View style={styles.dividerContainer}>
              <Divider style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <Divider style={styles.divider} />
            </View>

            <Button
              mode="outlined"
              onPress={() => promptAsync()}
              disabled={loading || !request}
              icon={() => <Chrome size={20} color={theme.colors.primary} />}
              style={styles.secondaryButton}
            >
              Sign in with Google
            </Button>

            <Button
              mode="text"
              onPress={handleDevLogin}
              disabled={loading}
              icon={() => <Code size={20} color={theme.colors.secondary} />}
              style={styles.devButton}
            >
              Use Developer Account
            </Button>
          </Card.Content>
        </Card>

        {loading && <ActivityIndicator animating={true} style={{ marginTop: 20 }} />}

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>
            v-front: {process.env.EXPO_PUBLIC_VERSION || 'dev'} | v-back: {backendVersion}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6200ee',
  },
  appSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    elevation: 4,
    borderRadius: 12,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  devButton: {
    marginTop: 16,
  },
  sentContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  sentText: {
    color: 'green',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#999',
    fontSize: 12,
  },
  versionContainer: {
    marginTop: 30,
    alignItems: 'center',
    opacity: 0.5,
  },
  versionText: {
    fontSize: 10,
    color: '#666',
  },
});

export default AuthScreen;
