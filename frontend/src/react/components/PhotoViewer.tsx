import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Modal, Image, Dimensions, FlatList, ActivityIndicator, Platform } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { X, Edit2 } from 'lucide-react-native';
import { S3Repository } from '../../infra/s3.repository';
import { uint8ArrayToBase64 } from '../../infra/utils';
import { EditScreen } from './EditScreen';
import type { Photo, S3Credentials } from '../../domain/types';

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  onEditSave?: (photo: Photo, newUri: string) => void;
  creds: S3Credentials;
}

const { width, height } = Dimensions.get('window');

const PhotoViewerItem = React.memo(({ photo, creds, onUrlLoaded }: { photo: Photo, creds: S3Credentials, onUrlLoaded?: (url: string) => void }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
      let isMounted = true;
      let currentUrls: string[] = [];

      const load = async () => {
          if (photo.type === 'local') {
              setFullUrl(photo.uri);
              return;
          }

          const s3Repo = new S3Repository(creds);

          try {
              // 1. Load Thumbnail first (blurred)
              const thumbData = await s3Repo.getFile(creds.bucket, photo.key);
              if (isMounted) {
                  const url = Platform.OS === 'web'
                    ? URL.createObjectURL(new Blob([thumbData], { type: 'image/jpeg' }))
                    : `data:image/jpeg;base64,${uint8ArrayToBase64(thumbData)}`;
                  if (Platform.OS === 'web') currentUrls.push(url);
                  setThumbUrl(url);
              }

              // 2. Load 1080p
              setLoading(true);
              const fullKey = S3Repository.get1080pKey(photo.key);
              const fullData = await s3Repo.getFile(creds.bucket, fullKey);
              if (isMounted) {
                  const url = Platform.OS === 'web'
                    ? URL.createObjectURL(new Blob([fullData], { type: 'image/jpeg' }))
                    : `data:image/jpeg;base64,${uint8ArrayToBase64(fullData)}`;
                  if (Platform.OS === 'web') currentUrls.push(url);
                  setFullUrl(url);
                  setLoading(false);
                  if (onUrlLoaded) onUrlLoaded(url);
              }

              // 3. Try original if 1080p is loaded
              const originalKey = S3Repository.getOriginalKey(photo.key);
              const originalExists = await s3Repo.exists(creds.bucket, originalKey);
              if (originalExists && isMounted) {
                  const originalData = await s3Repo.getFile(creds.bucket, originalKey);
                  if (isMounted) {
                      const url = Platform.OS === 'web'
                        ? URL.createObjectURL(new Blob([originalData], { type: 'image/jpeg' }))
                        : `data:image/jpeg;base64,${uint8ArrayToBase64(originalData)}`;
                      if (Platform.OS === 'web') currentUrls.push(url);
                      setFullUrl(url);
                      if (onUrlLoaded) onUrlLoaded(url);
                  }
              }
          } catch (e) {
              console.error('Failed to load image in viewer', e);
              setLoading(false);
          }
      };

      load();

      return () => {
          isMounted = false;
          if (Platform.OS === 'web') {
              currentUrls.forEach(url => URL.revokeObjectURL(url));
          }
      };
  }, [photo.id, photo.type, photo.key, photo.uri, creds]);

  return (
    <View style={styles.itemContainer}>
      {fullUrl ? (
          <Image source={{ uri: fullUrl }} style={styles.fullImage} resizeMode="contain" />
      ) : thumbUrl ? (
          <Image source={{ uri: thumbUrl }} style={styles.fullImage} blurRadius={10} resizeMode="contain" />
      ) : (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
          </View>
      )}
      {loading && (
          <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#fff" />
          </View>
      )}
    </View>
  );
});

export const PhotoViewer: React.FC<PhotoViewerProps> = ({ photos, initialIndex, visible, onClose, onEditSave, creds }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [editing, setEditing] = useState(false);
    const [currentFullUrl, setCurrentFullUrl] = useState<string | null>(null);
    const theme = useTheme();

    const onScroll = useCallback((event: any) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        if (index >= 0 && index < photos.length) {
            setCurrentIndex(index);
        }
    }, [photos.length]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.container}>
                <Appbar.Header style={styles.header} dark>
                    <Appbar.Action icon={() => <X color="#fff" />} onPress={onClose} />
                    <Appbar.Content title={`${currentIndex + 1} / ${photos.length}`} color="#fff" />
                    {currentFullUrl && (
                        <Appbar.Action icon={() => <Edit2 color="#fff" />} onPress={() => setEditing(true)} />
                    )}
                </Appbar.Header>

                <FlatList
                    data={photos}
                    renderItem={({ item, index }) => (
                        <PhotoViewerItem
                            photo={item}
                            creds={creds}
                            onUrlLoaded={(url) => {
                                if (index === currentIndex) setCurrentFullUrl(url);
                            }}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={initialIndex}
                    getItemLayout={(_, index) => ({
                        length: width,
                        offset: width * index,
                        index,
                    })}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    style={styles.list}
                />

                {editing && currentFullUrl && (
                    <EditScreen
                        photo={photos[currentIndex]}
                        uri={currentFullUrl}
                        visible={editing}
                        onClose={() => setEditing(false)}
                        onSave={(newUri) => {
                            setEditing(false);
                            if (onEditSave) onEditSave(photos[currentIndex], newUri);
                        }}
                    />
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        elevation: 0,
        zIndex: 10,
    },
    list: {
        flex: 1,
    },
    itemContainer: {
        width: width,
        height: height,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 100,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        padding: 5,
        borderRadius: 20,
    }
});
