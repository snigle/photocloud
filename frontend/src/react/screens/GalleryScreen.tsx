import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator, Image, useWindowDimensions, Platform, TouchableOpacity } from 'react-native';
import { Appbar, Text, useTheme, FAB, ProgressBar, Snackbar } from 'react-native-paper';
import { LogOut, RefreshCw, Upload } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import { S3Repository } from '../../infra/s3.repository';
import { PhotoViewer } from '../components/PhotoViewer';
import type { S3Credentials, Photo } from '../../domain/types';
import { uint8ArrayToBase64 } from '../../infra/utils';

const FlashListAny = FlashList as any;

const PhotoItem = React.memo(({ photo, creds, size, onPress }: { photo: Photo, creds: S3Credentials, size: number, onPress: (id: string) => void }) => {
  const [url, setUrl] = useState<string | null>(null);

  const handlePress = useCallback(() => {
      onPress(photo.id);
  }, [photo.id, onPress]);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;

    if (photo.type === 'local') {
      setUrl(photo.uri);
      return;
    }

    setUrl(null); // Reset URL when photo changes

    if (photo.type === 'cloud') {
      const s3Repo = new S3Repository(creds);

      const load = async () => {
          try {
              // SSE-C objects cannot be displayed via simple presigned URLs in browser <img> tags
              const data = await s3Repo.getFile(creds.bucket, photo.key);

              if (isMounted) {
                  if (Platform.OS === 'web') {
                      const blob = new Blob([data as any], { type: 'image/jpeg' });
                      currentUrl = URL.createObjectURL(blob);
                      setUrl(currentUrl);
                  } else {
                      const base64 = uint8ArrayToBase64(data);
                      setUrl(`data:image/jpeg;base64,${base64}`);
                  }
              }
          } catch (err) {
              console.error('Failed to load cloud image', err);
          }
      };

      load();
    }
    return () => {
        isMounted = false;
        if (currentUrl && Platform.OS === 'web') {
            URL.revokeObjectURL(currentUrl);
        }
    };
  }, [photo.id, photo.type, (photo as any).key, (photo as any).uri, creds]);

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.imageContainer, { width: size, height: size }]}>
      {url ? (
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
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
    </TouchableOpacity>
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
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Memoize creds to ensure stability for PhotoItem memoization
  const stableCreds = React.useMemo(() => creds, [creds.access, creds.secret, creds.bucket, creds.endpoint]);

  const { photos, totalCount, loading, refreshing, error, refresh, loadMore, addPhoto } = useGallery(stableCreds, email);
  const { upload, uploading, progress, error: uploadError } = useUpload(creds, email);

  const handleUpload = async () => {
    await upload((photo) => {
        addPhoto(photo);
    });
  };

  const handleItemPress = useCallback((id: string) => {
    setViewerPhotoId(id);
  }, []);

  const handleEditSave = async (photo: Photo, newUri: string) => {
    const newPhoto: Photo = {
        ...photo,
        type: 'local',
        uri: newUri,
    };
    await addPhoto(newPhoto);
    setSnackbarVisible(true);
  };

  const numColumns = Math.max(3, Math.floor(width / 180));
  const itemSize = width / numColumns;

  const renderItem = useCallback(({ item }: any) => (
    <PhotoItem
        photo={item}
        creds={stableCreds}
        size={itemSize}
        onPress={handleItemPress}
    />
  ), [stableCreds, itemSize, handleItemPress]);

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
          <ProgressBar
            progress={progress.current / progress.total}
            color={theme.colors.primary}
            style={{ height: 4 }}
          />
      )}

      {(error || uploadError) && (
        <View style={styles.errorBanner}>
          <Text style={{ color: theme.colors.error }}>{error || uploadError}</Text>
        </View>
      )}

      <View style={styles.listContainer}>
          {!loading && photos.length === 0 && !error && (
            <View style={styles.center}>
              {uploading ? (
                  <>
                      <ActivityIndicator size="large" color={theme.colors.primary} />
                      <Text style={{ marginTop: 10 }}>Preparing upload...</Text>
                  </>
              ) : (
                  <>
                      <Text>No photos found.</Text>
                      <Text variant="bodySmall">Local and Cloud photos will appear here.</Text>
                  </>
              )}
            </View>
          )}

          <FlashListAny
            data={photos}
            renderItem={renderItem}
            keyExtractor={(item: Photo) => item.id}
            numColumns={numColumns}
            key={numColumns} // Force re-render when column count changes
            estimatedItemSize={180}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
            contentContainerStyle={{ flexGrow: 1 }}
          />
      </View>

      <FAB
        icon={() => <Upload size={24} color={theme.colors.onPrimaryContainer} />}
        style={styles.fab}
        onPress={handleUpload}
        loading={uploading}
        disabled={uploading}
      />

      {viewerPhotoId !== null && (
          <PhotoViewer
            photos={photos}
            initialPhotoId={viewerPhotoId}
            visible={viewerPhotoId !== null}
            onClose={() => setViewerPhotoId(null)}
            onEditSave={handleEditSave}
            creds={stableCreds}
          />
      )}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
            label: 'OK',
            onPress: () => setSnackbarVisible(false),
        }}>
        Photo edited and saved to gallery!
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContainer: {
    flex: 1,
    minHeight: 100, // Ensure it has some height
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
    padding: 2,
  },
  image: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
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
