import React, { useState, useEffect } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { Appbar, Text, useTheme, FAB, ProgressBar } from 'react-native-paper';
import { LogOut, RefreshCw, Upload } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import { S3Repository } from '../../infra/s3.repository';
import type { S3Credentials, Photo } from '../../domain/types';
import { uint8ArrayToBase64 } from '../../infra/utils';

const FlashListAny = FlashList as any;

const PhotoItem = React.memo(({ photo, creds, size }: { photo: Photo | null, creds: S3Credentials, size: number }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!photo) {
        setUrl(null);
        return;
    }

    if (photo.type === 'local') {
      setUrl(photo.uri);
      return;
    }

    setUrl(null); // Reset URL when photo changes

    if (photo.type === 'cloud') {
      const s3Repo = new S3Repository(creds);

      const load = async () => {
          try {
              // Use signed URL for better performance and browser caching
              const signedUrl = await s3Repo.getDownloadUrl(creds.bucket, photo.key);

              if (isMounted) {
                  setUrl(signedUrl);
              }
          } catch (err) {
              console.error('Failed to load cloud image', err);
          }
      };

      load();
    }
    return () => { isMounted = false; };
  }, [photo.id, photo.type, photo.key, photo.uri, creds]);

  return (
    <View style={[styles.imageContainer, { width: size, height: size }]}>
      {url ? (
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
            {photo && <ActivityIndicator size="small" />}
        </View>
      )}
      {photo?.type === 'cloud' && (
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
  const { width } = useWindowDimensions();
  const { photos, totalCount, loading, refreshing, error, refresh, loadMore, addPhoto } = useGallery(creds, email);
  const { upload, uploading, progress, error: uploadError } = useUpload(creds, email);

  const handleUpload = async () => {
    await upload((photo) => {
        addPhoto(photo);
    });
  };

  const numColumns = Math.max(3, Math.floor(width / 180));
  const itemSize = width / numColumns;

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.Content
            title="PhotoCloud"
            subtitle={uploading && progress ? `Uploading ${progress.current}/${progress.total}...` : `${totalCount} photos`}
        />
        {uploading && !progress && <ActivityIndicator style={{ marginRight: 10 }} color={theme.colors.primary} />}
        <Appbar.Action
          icon={() => <Upload size={24} color={theme.colors.onSurface} />}
          onPress={handleUpload}
          disabled={uploading}
        />
        <Appbar.Action icon={() => <RefreshCw size={24} color={theme.colors.onSurface} />} onPress={refresh} />
        <Appbar.Action icon={() => <LogOut size={24} color={theme.colors.onSurface} />} onPress={onLogout} />
      </Appbar.Header>

      {uploading && progress && (
          <ProgressBar progress={progress.current / progress.total} color={theme.colors.primary} />
      )}

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
        renderItem={({ item }: any) => <PhotoItem photo={item} creds={creds} size={itemSize} />}
        keyExtractor={(item: Photo | null, index: number) => item?.id || `placeholder-${index}`}
        numColumns={numColumns}
        key={numColumns} // Force re-render when column count changes
        estimatedItemSize={180}
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
