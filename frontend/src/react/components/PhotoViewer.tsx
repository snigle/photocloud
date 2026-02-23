import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Modal, Image, Dimensions, FlatList, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { X, Edit2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { S3Repository } from '../../infra/s3.repository';
import { uint8ArrayToBase64 } from '../../infra/utils';
import { EditScreen } from './EditScreen';
import type { Photo, S3Credentials } from '../../domain/types';

interface PhotoViewerProps {
  photos: Photo[];
  initialPhotoId: string;
  visible: boolean;
  onClose: () => void;
  onEditSave?: (photo: Photo, newUri: string) => void;
  creds: S3Credentials;
}

const { width, height } = Dimensions.get('window');

const PhotoViewerItem = React.memo(({ photo, creds, onUrlLoaded, isActive, isNear }: { photo: Photo, creds: S3Credentials, onUrlLoaded?: (url: string) => void, isActive: boolean, isNear: boolean }) => {
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

          // Only load if near the active window
          if (!isNear && !isActive) return;

          const s3Repo = new S3Repository(creds);

          try {
              // 1. Load Thumbnail first (blurred)
              const thumbData = await s3Repo.getFile(creds.bucket, (photo as any).key);
              if (isMounted) {
                  const url = Platform.OS === 'web'
                    ? URL.createObjectURL(new Blob([thumbData as any], { type: 'image/jpeg' }))
                    : `data:image/jpeg;base64,${uint8ArrayToBase64(thumbData)}`;
                  if (Platform.OS === 'web') currentUrls.push(url);
                  setThumbUrl(url);
              }

              // 2. Load 1080p only if near or active
              setLoading(true);
              const fullKey = S3Repository.get1080pKey((photo as any).key);
              const fullData = await s3Repo.getFile(creds.bucket, fullKey);
              if (isMounted) {
                  const url = Platform.OS === 'web'
                    ? URL.createObjectURL(new Blob([fullData as any], { type: 'image/jpeg' }))
                    : `data:image/jpeg;base64,${uint8ArrayToBase64(fullData)}`;
                  if (Platform.OS === 'web') currentUrls.push(url);
                  setFullUrl(url);
                  setLoading(false);
                  if (onUrlLoaded && isActive) onUrlLoaded(url);
              }

              // 3. Try original ONLY if ACTIVE
              if (isActive) {
                  const originalKey = S3Repository.getOriginalKey((photo as any).key);
                  const originalExists = await s3Repo.exists(creds.bucket, originalKey);
                  if (originalExists && isMounted) {
                      const originalData = await s3Repo.getFile(creds.bucket, originalKey);
                      if (isMounted) {
                          const url = Platform.OS === 'web'
                            ? URL.createObjectURL(new Blob([originalData as any], { type: 'image/jpeg' }))
                            : `data:image/jpeg;base64,${uint8ArrayToBase64(originalData)}`;
                          if (Platform.OS === 'web') currentUrls.push(url);
                          setFullUrl(url);
                          if (onUrlLoaded) onUrlLoaded(url);
                      }
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
  }, [photo.id, photo.type, (photo as any).key, (photo as any).uri, creds, isActive, isNear]);

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

export const PhotoViewer: React.FC<PhotoViewerProps> = ({ photos, initialPhotoId, visible, onClose, onEditSave, creds }) => {
    const [currentIndex, setCurrentIndex] = useState(() => {
        const idx = photos.findIndex(p => p.id === initialPhotoId);
        return idx >= 0 ? idx : 0;
    });
    const [editing, setEditing] = useState(false);
    const [currentFullUrl, setCurrentFullUrl] = useState<string | null>(null);
    const [lastSavedId, setLastSavedId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const theme = useTheme();

    const onScroll = useCallback((event: any) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        if (index >= 0 && index < photos.length) {
            setCurrentIndex(index);
        }
    }, [photos.length]);

    useEffect(() => {
        if (lastSavedId) {
            const index = photos.findIndex(p => p.id === lastSavedId);
            if (index >= 0) {
                // Scroll to the newly added photo
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index, animated: true });
                    setCurrentIndex(index);
                    setLastSavedId(null);
                }, 500);
            }
        }
    }, [photos, lastSavedId]);

    const goToPrevious = () => {
        if (currentIndex > 0) {
            flatListRef.current?.scrollToIndex({ index: currentIndex - 1 });
            setCurrentIndex(currentIndex - 1);
        }
    };

    const goToNext = () => {
        if (currentIndex < photos.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
            setCurrentIndex(currentIndex + 1);
        }
    };

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
                    ref={flatListRef}
                    data={photos}
                    renderItem={({ item, index }) => (
                        <PhotoViewerItem
                            photo={item}
                            creds={creds}
                            isActive={index === currentIndex}
                            isNear={Math.abs(index - currentIndex) <= 1}
                            onUrlLoaded={(url) => {
                                if (index === currentIndex) setCurrentFullUrl(url);
                            }}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={photos.findIndex(p => p.id === initialPhotoId) >= 0 ? photos.findIndex(p => p.id === initialPhotoId) : 0}
                    getItemLayout={(_, index) => ({
                        length: width,
                        offset: width * index,
                        index,
                    })}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    style={styles.list}
                    windowSize={3}
                    initialNumToRender={1}
                    maxToRenderPerBatch={1}
                />

                {currentIndex > 0 && (
                    <TouchableOpacity style={[styles.navButton, styles.leftButton]} onPress={goToPrevious}>
                        <ChevronLeft color="#fff" size={32} />
                    </TouchableOpacity>
                )}

                {currentIndex < photos.length - 1 && (
                    <TouchableOpacity style={[styles.navButton, styles.rightButton]} onPress={goToNext}>
                        <ChevronRight color="#fff" size={32} />
                    </TouchableOpacity>
                )}

                {editing && currentFullUrl && (
                    <EditScreen
                        photo={photos[currentIndex]}
                        uri={currentFullUrl}
                        visible={editing}
                        onClose={() => setEditing(false)}
                        onSave={(newUri) => {
                            setEditing(false);
                            if (onEditSave) {
                                onEditSave(photos[currentIndex], newUri);
                            }
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
    },
    navButton: {
        position: 'absolute',
        top: height / 2 - 25,
        backgroundColor: 'rgba(0,0,0,0.3)',
        padding: 10,
        borderRadius: 25,
        zIndex: 20,
    },
    leftButton: {
        left: 10,
    },
    rightButton: {
        right: 10,
    }
});
