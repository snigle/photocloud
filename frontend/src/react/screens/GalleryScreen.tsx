import React, { useState, useEffect } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator, Image, Dimensions } from 'react-native';
import { Appbar, Text, useTheme, FAB } from 'react-native-paper';
import { LogOut, RefreshCw, Upload } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import { S3Repository } from '../../infra/s3.repository';
import type { S3Credentials, Photo } from '../../domain/types';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;
const FlashListAny = FlashList as any;

const PhotoItem = React.memo(({ photo, creds }: { photo: Photo, creds: S3Credentials }) => {
  const [url, setUrl] = useState<string | null>(photo.type === 'local' ? photo.uri : null);

  useEffect(() => {
    let isMounted = true;
    if (photo.type === 'cloud' && !url) {
      const s3Repo = new S3Repository(creds);
      // Try thumbnail first
      const thumbKey = photo.key.replace('/original/', '/thumbnail/');
      s3Repo.getDownloadUrl(creds.bucket, thumbKey)
        .then(u => {
          if (isMounted) setUrl(u);
        })
        .catch(() => {
           // Fallback to original
           s3Repo.getDownloadUrl(creds.bucket, photo.key).then(u => {
             if (isMounted) setUrl(u);
           });
        });
    }
    return () => { isMounted = false; };
  }, [photo, creds]);

  return (
    <View style={styles.imageContainer}>
      {url ? (
        <Image source={{ uri: url }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
            <ActivityIndicator size="small" />
        </View>
      )}
      {photo.type === 'cloud' && (
          <View style={styles.cloudBadge}>
              <Text style={styles.cloudBadgeText}>☁️</Text>
          </View>
      )}
    </View>
  );
});

interface Props {
  creds: S3Credentials;
  email: string;
  onLogout: () => void;
}

const GalleryScreen: React.FC<Props> = ({ creds, email, onLogout }) => {
  const theme = useTheme();
  const { photos, loading, refreshing, error, refresh, loadMore } = useGallery(creds, email);
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
        <Appbar.Content title="PhotoCloud" subtitle={`${photos.length} photos`} />
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
          <Text>No photos found.</Text>
          <Text variant="bodySmall">Local and Cloud photos will appear here.</Text>
        </View>
      )}

      <FlashListAny
        data={photos}
        renderItem={({ item }: any) => <PhotoItem photo={item} creds={creds} />}
        keyExtractor={(item: Photo) => item.id}
        numColumns={COLUMN_COUNT}
        estimatedItemSize={ITEM_SIZE}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
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
  imageContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
  },
  image: {
    flex: 1,
    backgroundColor: '#eee',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cloudBadge: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 10,
      padding: 2,
  },
  cloudBadgeText: {
      fontSize: 10,
  }
});

export default GalleryScreen;
