import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Image, Platform, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Circle, Check } from 'lucide-react-native';
import { S3Repository } from '../../infra/s3.repository';
import type { S3Credentials, Photo } from '../../domain/types';
import { uint8ArrayToBase64 } from '../../infra/utils';

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
    photo: Photo,
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

  const handlePress = useCallback((e: any) => {
      onPress(photo.id, e);
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

  const handleSelect = useCallback((e: any) => {
    onSelect(photo.id, e);
  }, [photo.id, onSelect]);

  const handleLongPress = useCallback(() => {
    onLongPress(photo.id);
  }, [photo.id, onLongPress]);

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
            onMouseLeave: () => setIsHovered(false),
            onMouseDown: (e: any) => {
                if (e.button === 0) { // Left click
                    onDragStart(photo.id);
                }
            },
            onMouseUp: () => onDragEnd(),
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
