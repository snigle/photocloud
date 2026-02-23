import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator, Image, useWindowDimensions, Platform, TouchableOpacity } from 'react-native';
import { Appbar, Text, useTheme, FAB, ProgressBar, Snackbar, Portal, Dialog, Button } from 'react-native-paper';
import { LogOut, RefreshCw, Upload, CheckCircle2, Circle, X, Trash2, Check } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import { useSelection } from '../hooks/useSelection';
import { groupPhotosByDay, ListItem } from '../utils/gallery-utils';
import { S3Repository } from '../../infra/s3.repository';
import { PhotoViewer } from '../components/PhotoViewer';
import type { S3Credentials, Photo } from '../../domain/types';
import { uint8ArrayToBase64 } from '../../infra/utils';

const FlashListAny = FlashList as any;

const PhotoItem = React.memo(({
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
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  // Memoize creds to ensure stability for PhotoItem memoization
  const stableCreds = React.useMemo(() => creds, [creds.access, creds.secret, creds.bucket, creds.endpoint]);

  const { photos, totalCount, loading, refreshing, error, refresh, loadMore, addPhoto, deletePhotos } = useGallery(stableCreds, email);
  const { upload, uploadSingle, uploading, progress, error: uploadError } = useUpload(creds, email);
  const {
    selectedIds,
    handleSelect,
    clearSelection,
    toggleSelectionMode,
    isSelectionMode,
    isDragging,
    startDragging,
    stopDragging,
    handleDragEnter
  } = useSelection(photos);

  const handleLongPress = useCallback((id: string) => {
    toggleSelectionMode(id);
    if (Platform.OS !== 'web') {
        // Start dragging mode on mobile after long press
        startDragging(id);
    }
  }, [toggleSelectionMode, startDragging]);

  const listData = React.useMemo(() => groupPhotosByDay(photos), [photos]);

  const handleUpload = async () => {
    await upload((photo) => {
        addPhoto(photo);
    });
  };

  const handleItemPress = useCallback((id: string, event?: any) => {
    if (isSelectionMode) {
        handleSelect(id, event);
        return;
    }

    if (Platform.OS === 'web' && event) {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            handleSelect(id, event);
            return;
        }
    }

    setViewerPhotoId(id);
  }, [isSelectionMode, handleSelect]);

  const handleDeleteSelected = () => {
      if (selectedIds.size === 0) return;
      setDeleteDialogVisible(true);
  };

  const confirmDelete = async () => {
      setDeleteDialogVisible(false);
      const idsToDelete = Array.from(selectedIds);
      clearSelection();
      await deletePhotos(idsToDelete);
  };

  const handleEditSave = async (originalPhoto: Photo, newUri: string) => {
    // Persist to S3
    const filename = `edited-${originalPhoto.id}.jpg`;
    const uploaded = await uploadSingle(newUri, filename, originalPhoto.creationDate, (uploaded) => {
        addPhoto(uploaded);
    });

    if (uploaded) {
        // Delete original photo to "overwrite"
        await deletePhotos([originalPhoto.id]);
    }

    setSnackbarVisible(true);
  };

  const numColumns = Math.max(3, Math.floor(width / 180));
  const itemSize = width / numColumns;

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
        return (
            <View style={styles.headerContainer}>
                <Text style={styles.headerTitle}>{item.title}</Text>
            </View>
        );
    }
    return (
        <PhotoItem
            photo={item.photo}
            creds={stableCreds}
            size={itemSize}
            onPress={handleItemPress}
            isSelected={selectedIds.has(item.photo.id)}
            onSelect={(id, event) => handleSelect(id, event)}
            onLongPress={handleLongPress}
            isSelectionMode={selectedIds.size > 0}
            onDragStart={startDragging}
            onDragEnter={handleDragEnter}
            onDragEnd={stopDragging}
        />
    );
  }, [stableCreds, itemSize, handleItemPress, selectedIds, handleSelect, handleLongPress]);

  return (
    <View style={styles.container}>
      {selectedIds.size > 0 ? (
        <Appbar.Header style={{ backgroundColor: '#e3f2fd' }}>
            <Appbar.Action icon={() => <X size={24} />} onPress={clearSelection} />
            <Appbar.Content title={`${selectedIds.size} sélectionné(s)`} />
            <Appbar.Action icon={() => <Trash2 size={24} />} onPress={handleDeleteSelected} />
        </Appbar.Header>
      ) : (
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
      )}

      {uploading && progress && (
          <View><ProgressBar
            progress={progress.current / progress.total}
            color={theme.colors.primary}
            style={{ height: 4 }}
          /></View>
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
            data={listData}
            renderItem={renderItem}
            keyExtractor={(item: ListItem) => item.id || (item as any).photo.id}
            numColumns={numColumns}
            key={numColumns} // Force re-render when column count changes
            estimatedItemSize={180}
            getItemType={(item: ListItem) => item.type}
            overrideItemLayout={(layout: any, item: ListItem) => {
                if (item.type === 'header') {
                    layout.size = 50;
                } else {
                    layout.size = itemSize;
                }
            }}
            getColumnSpan={(item: ListItem) => {
                return item.type === 'header' ? numColumns : 1;
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
            contentContainerStyle={{ flexGrow: 1 }}
          />
      </View>

      {selectedIds.size === 0 && (
          <FAB
            icon={() => <Upload size={24} color={theme.colors.onPrimaryContainer} />}
            style={styles.fab}
            onPress={handleUpload}
            loading={uploading}
            disabled={uploading}
          />
      )}

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Supprimer les photos</Dialog.Title>
          <Dialog.Content>
            <Text>Êtes-vous sûr de vouloir supprimer {selectedIds.size} photo(s) ? Cette action est irréversible.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Annuler</Button>
            <Button onPress={confirmDelete} textColor={theme.colors.error}>Supprimer</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  headerContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    width: '100%',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
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

export default GalleryScreen;
