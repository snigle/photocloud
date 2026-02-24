import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Image, Platform, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Circle, Check } from 'lucide-react-native';
import { S3Repository } from '../../infra/s3.repository';
import type { S3Credentials, Photo } from '../../domain/types';
import { uint8ArrayToBase64 } from '../../infra/utils';
import { ThumbnailCache } from '../../infra/thumbnail-cache';

export const PhotoItem = React.memo(({
    photo,
    creds,
    size,
    onPress,
    isSelected,
    onSelect,
    onLongPress,
    isSelectionMode,
    onDragStart,
    onDragEnter,
    onDragEnd
}: {
    photo: Photo | null,
    creds: S3Credentials,
    size: number,
    onPress: (id: string, event?: any) => void,
    isSelected: boolean,
    onSelect: (id: string, event?: any) => void,
    onLongPress: (id: string) => void,
    isSelectionMode: boolean,
    onDragStart: (id: string) => void,
    onDragEnter: (id: string) => void,
    onDragEnd: () => void
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const dragTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
        if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    };
  }, []);

  const handlePress = useCallback((e: any) => {
      if (!photo) return;
      onPress(photo.id, e);
  }, [photo?.id, onPress]);

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

    // Check cache first
    const cached = ThumbnailCache.get(photo.key);
    if (cached?.displayUrl) {
        setUrl(cached.displayUrl);
        return;
    }

    setUrl(null); // Reset URL when photo changes and not in cache

    if (photo.type === 'cloud') {
      const s3Repo = new S3Repository(creds);

      const load = async () => {
          try {
              // SSE-C objects cannot be displayed via simple presigned URLs in browser <img> tags
              const data = await s3Repo.getFile(creds.bucket, photo.key);

              if (isMounted) {
                  let displayUrl: string;
                  if (Platform.OS === 'web') {
                      const blob = new Blob([data as any], { type: 'image/jpeg' });
                      displayUrl = URL.createObjectURL(blob);
                  } else {
                      const base64 = uint8ArrayToBase64(data);
                      displayUrl = `data:image/jpeg;base64,${base64}`;
                  }

                  // Update cache with displayUrl
                  ThumbnailCache.set(photo.key, { data, displayUrl });
                  setUrl(displayUrl);
              }
          } catch (err) {
              console.error('Failed to load cloud image', err);
          }
      };

      const timer = setTimeout(load, 200);
      return () => {
          isMounted = false;
          clearTimeout(timer);
      };
    }
    return () => {
        isMounted = false;
    };
  }, [photo?.id, photo?.type, (photo as any)?.key, (photo as any)?.uri, creds]);

  const handleSelect = useCallback((e: any) => {
    if (!photo) return;
    onSelect(photo.id, e);
  }, [photo?.id, onSelect]);

  const handleLongPress = useCallback(() => {
    if (!photo) return;
    onLongPress(photo.id);
  }, [photo?.id, onLongPress]);

  if (!photo) {
    return (
        <View style={[styles.imageContainer, { width: size, height: size }]}>
            <View style={styles.placeholder} />
        </View>
    );
  }

  return (
    <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={[styles.imageContainer, { width: size, height: size }]}
        {...(Platform.OS === 'web' ? {
            onMouseEnter: () => {
                setIsHovered(true);
                onDragEnter(photo.id);
            },
            onMouseLeave: () => {
                setIsHovered(false);
                if (dragTimerRef.current) {
                    clearTimeout(dragTimerRef.current);
                    dragTimerRef.current = null;
                }
            },
            onMouseDown: (e: any) => {
                if (e.button === 0) { // Left click
                    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
                    dragTimerRef.current = setTimeout(() => {
                        onDragStart(photo.id);
                        dragTimerRef.current = null;
                    }, 200);
                }
            },
            onMouseUp: () => {
                if (dragTimerRef.current) {
                    clearTimeout(dragTimerRef.current);
                    dragTimerRef.current = null;
                }
                onDragEnd();
            },
        } as any : {})}
    >
      <View style={[styles.imageWrapper, isSelected && styles.selectedImageWrapper]}>
        {url ? (
            <Image source={{ uri: url }} style={[styles.image, isSelected && styles.selectedImage]} resizeMode="cover" />
        ) : (
            <View style={styles.placeholder}>
                <ActivityIndicator size="small" />
            </View>
        )}

        {isSelected && <View style={styles.selectionOverlay} />}

        {/* Selection Indicator */}
        {(isSelected || (Platform.OS === 'web' && isHovered) || isSelectionMode) && (
            <TouchableOpacity
                style={[
                    styles.selectionIndicator,
                    isSelected && styles.selectionIndicatorSelected
                ]}
                onPress={(e) => {
                    e.stopPropagation();
                    handleSelect(e);
                }}
            >
                {isSelected ? (
                    <Check size={20} color="#fff" strokeWidth={4} />
                ) : (
                    <Circle size={24} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                )}
            </TouchableOpacity>
        )}

        {photo.type === 'cloud' && !isSelected && (
            <View style={styles.cloudBadge}>
                <Text style={styles.cloudBadgeText}>☁️</Text>
            </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  imageContainer: {
    padding: 2,
  },
  imageWrapper: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  selectedImageWrapper: {
    backgroundColor: '#e3f2fd',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 91, 187, 0.2)',
    zIndex: 5,
  },
  image: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  selectedImage: {
    borderRadius: 2,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 5,
    left: 5,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  selectionIndicatorSelected: {
    backgroundColor: '#005bbb',
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
