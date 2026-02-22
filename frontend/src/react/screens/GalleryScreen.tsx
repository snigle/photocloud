import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Appbar, List, Text, useTheme, Divider, FAB } from 'react-native-paper';
import { LogOut, RefreshCw, FileText, Upload } from 'lucide-react-native';
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import type { S3Credentials } from '../../domain/types';

interface Props {
  creds: S3Credentials;
  email: string;
  onLogout: () => void;
}

const GalleryScreen: React.FC<Props> = ({ creds, email, onLogout }) => {
  const theme = useTheme();
  const { photos, loading, error, refresh } = useGallery(creds, email);
  const { upload, uploading, error: uploadError } = useUpload(creds, email);

  const handleUpload = async () => {
    const success = await upload();
    if (success) {
      refresh();
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.Content title="My Cloud" subtitle={email} />
        {uploading && <ActivityIndicator style={{ marginRight: 10 }} color={theme.colors.primary} />}
        <Appbar.Action
          icon={() => <Upload size={24} color={theme.colors.onSurface} />}
          onPress={handleUpload}
          disabled={uploading}
        />
        <Appbar.Action icon={() => <RefreshCw size={24} color={theme.colors.onSurface} />} onPress={refresh} />
        <Appbar.Action icon={() => <LogOut size={24} color={theme.colors.onSurface} />} onPress={onLogout} />
      </Appbar.Header>

      {(error || uploadError) && (
        <View style={styles.errorBanner}>
          <Text style={{ color: theme.colors.error }}>{error || uploadError}</Text>
        </View>
      )}

      {!loading && photos.length === 0 && !error && (
        <View style={styles.center}>
          <Text>No files found in your cloud.</Text>
          <Text variant="bodySmall">Storage and indexing specs coming soon.</Text>
        </View>
      )}

      <FlatList
        data={photos}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        renderItem={({ item }) => (
          <>
            <List.Item
              title={item.key.split('/').pop()}
              description={item.key}
              left={props => <List.Icon {...props} icon={() => <FileText size={24} color={theme.colors.primary} />} />}
            />
            <Divider />
          </>
        )}
      />

      <FAB
        icon={() => <Upload size={24} color={theme.colors.onPrimaryContainer} />}
        style={styles.fab}
        onPress={handleUpload}
        loading={uploading}
        disabled={uploading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    paddingBottom: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorBanner: {
    backgroundColor: '#fee',
    padding: 10,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default GalleryScreen;
