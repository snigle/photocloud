import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { Text, useTheme, FAB, ProgressBar, Snackbar, Portal, Dialog, Button } from 'react-native-paper';
import { Upload } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { useGallery } from '../hooks/useGallery';
import { useUpload } from '../hooks/useUpload';
import { useSelection } from '../hooks/useSelection';
import { groupPhotosByDay, ListItem } from '../utils/gallery-utils';
import { PhotoViewer } from '../components/PhotoViewer';
import { PhotoItem } from '../components/PhotoItem';
import { GalleryHeader } from '../components/GalleryHeader';
import type { S3Credentials, Photo } from '../../domain/types';

const FlashListAny = FlashList as any;

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
  const stableCreds = useMemo(() => creds, [creds.access, creds.secret, creds.bucket, creds.endpoint]);

  const { photos, totalCount, cloudIndex, loading, refreshing, error, refresh, loadMore, addPhoto, deletePhotos } = useGallery(stableCreds, email);
  const { upload, uploadSingle, uploading, progress, error: uploadError } = useUpload(creds, email);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [showYearIndicator, setShowYearIndicator] = useState(false);
  const timeoutRef = React.useRef<any>(null);

  useEffect(() => {
    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  const {
    selectedIds,
    handleSelect,
    clearSelection,
    toggleSelectionMode,
    isSelectionMode,
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

  const listData = useMemo(() => groupPhotosByDay(photos), [photos]);

  const handleUpload = async () => {
    await upload((photo) => {
        addPhoto(photo);
    });
  };

  const handleItemPress = useCallback((id: string, event?: any) => {
    // FIX: Removed the automatic selection toggle when isSelectionMode is true.
    // Selection is now only handled by the checkbox in PhotoItem or keyboard modifiers on web.

    if (Platform.OS === 'web' && event) {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            handleSelect(id, event);
            return;
        }
    }

    setViewerPhotoId(id);
  }, [handleSelect]);

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
            isSelected={item.photo ? selectedIds.has(item.photo.id) : false}
            onSelect={(id, event) => handleSelect(id, event)}
            onLongPress={handleLongPress}
            isSelectionMode={isSelectionMode}
            onDragStart={startDragging}
            onDragEnter={handleDragEnter}
            onDragEnd={stopDragging}
        />
    );
  }, [stableCreds, itemSize, handleItemPress, selectedIds, handleSelect, handleLongPress, isSelectionMode, startDragging, handleDragEnter, stopDragging]);

  const handleScroll = useCallback((event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const contentHeight = event.nativeEvent.contentSize.height;
      const layoutHeight = event.nativeEvent.layoutMeasurement.height;

      if (contentHeight <= layoutHeight || listData.length === 0) return;

      const scrollPercent = Math.max(0, Math.min(1, offsetY / (contentHeight - layoutHeight)));
      const approxIndex = Math.floor(scrollPercent * (listData.length - 1));
      const item = listData[approxIndex];

      let year = '';
      if (item) {
          if (item.type === 'header') {
              // Extract year from localized date string "d mmmm yyyy"
              const parts = item.title.split(' ');
              year = parts[parts.length - 1];
          } else if (item.photo) {
              year = new Date(item.photo.creationDate * 1000).getFullYear().toString();
          }
      }

      // Fallback if item is null (placeholder)
      if (!year) {
          const photoIndex = Math.floor(scrollPercent * totalCount);
          const cloudTotal = cloudIndex.years.reduce((acc, y) => acc + y.count, 0);
          const numLocal = totalCount - cloudTotal;

          if (photoIndex < numLocal) {
              year = new Date().getFullYear().toString();
          } else {
              let remaining = photoIndex - numLocal;
              for (const y of cloudIndex.years) {
                  if (remaining < y.count) {
                      year = y.year;
                      break;
                  }
                  remaining -= y.count;
              }
          }
      }

      if (year && /^\d{4}$/.test(year)) {
          setCurrentYear(year);
          setShowYearIndicator(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setShowYearIndicator(false), 1500);
      }
  }, [listData, totalCount, cloudIndex]);

  return (
    <View style={styles.container}>
      <GalleryHeader
        selectedCount={selectedIds.size}
        uploading={uploading}
        progress={progress}
        totalCount={totalCount}
        onClearSelection={clearSelection}
        onDeleteSelected={handleDeleteSelected}
        onUpload={handleUpload}
        onRefresh={refresh}
        onLogout={onLogout}
      />

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
            keyExtractor={(item: ListItem) => {
                if (item.type === 'header') return item.id;
                return item.photo ? item.photo.id : (item as any).placeholderId;
            }}
            numColumns={numColumns}
            key={numColumns} // Force re-render when column count changes
            estimatedItemSize={180}
            extraData={{ selectedIds, isSelectionMode }}
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
            onScroll={handleScroll}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
            contentContainerStyle={{ flexGrow: 1 }}
          />
      </View>

      {showYearIndicator && currentYear && (
          <View style={styles.yearIndicator}>
              <Text style={styles.yearIndicatorText}>{currentYear}</Text>
          </View>
      )}

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
            photos={photos.filter(p => p !== null) as Photo[]}
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
  yearIndicator: {
    position: 'absolute',
    right: 20,
    top: '50%',
    backgroundColor: 'rgba(0, 91, 187, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 100,
  },
  yearIndicatorText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default GalleryScreen;
