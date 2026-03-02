import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Image, useWindowDimensions, ActivityIndicator, FlatList, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import { Appbar, Text, useTheme, IconButton, Portal, Dialog, Button } from 'react-native-paper';
import { ArrowLeft, MoreVertical, X, Trash2 } from 'lucide-react-native';
import { Album, S3Credentials, Photo, UploadedPhoto } from '../../domain/types';
import { useAlbums } from '../hooks/useAlbums';
import { useSelection } from '../hooks/useSelection';
import { PhotoItem } from '../components/PhotoItem';
import { PhotoViewer } from '../components/PhotoViewer';
import { S3Repository } from '../../infra/s3.repository';
import { uint8ArrayToBase64 } from '../../infra/utils';
import { ThumbnailCache } from '../../infra/thumbnail-cache';

interface AlbumDetailScreenProps {
    route: any;
    navigation: any;
    creds: S3Credentials;
    email: string;
}

const AlbumDetailScreen: React.FC<AlbumDetailScreenProps> = ({ route, navigation, creds, email }) => {
    const { albumId, album: initialAlbum } = route.params || {};
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const { getAlbum, removePhotosFromAlbum, loading: albumLoading } = useAlbums(creds, email);

    const [album, setAlbum] = useState<Album | null>(initialAlbum || null);
    const [refreshing, setRefreshing] = useState(false);
    const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [loadingCover, setLoadingCover] = useState(false);
    const [removeDialogVisible, setRemoveDialogVisible] = useState(false);

    const loadAlbum = useCallback(async () => {
        try {
            const data = await getAlbum(albumId);
            setAlbum(data);
        } catch (err) {
            console.error('Failed to load album', err);
        }
    }, [albumId, getAlbum]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAlbum();
        setRefreshing(false);
    }, [loadAlbum]);

    useEffect(() => {
        if (!album) {
            loadAlbum();
        }
    }, [album, loadAlbum]);

    const photos = useMemo(() => {
        if (!album) return [];
        const reconstructedPhotos: UploadedPhoto[] = album.photoKeys.map(key => {
            const parts = key.split('/');
            const filename = parts.pop()!;
            const namePart = filename.replace('.enc', '').replace('.json', '');
            const timestampMatch = namePart.match(/^(\d+)-/);
            const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
            const id = timestampMatch ? namePart.substring(timestampMatch[0].length) : namePart;

            return {
                id: id,
                key: key,
                creationDate: timestamp,
                size: 0,
                width: 0,
                height: 0,
                type: 'cloud' as const,
            };
        });

        // Sort photos based on album order
        if (album.order === 'date-desc') {
            reconstructedPhotos.sort((a, b) => b.creationDate - a.creationDate);
        } else if (album.order === 'date-asc') {
            reconstructedPhotos.sort((a, b) => a.creationDate - b.creationDate);
        }
        return reconstructedPhotos;
    }, [album]);

    useEffect(() => {
        let isMounted = true;
        const coverKey = album?.coverPhotoKey || (photos.length > 0 ? photos[0].key : null);

        if (!coverKey) {
            setCoverUrl(null);
            return;
        }

        const cached = ThumbnailCache.get(coverKey);
        if (cached?.displayUrl) {
            setCoverUrl(cached.displayUrl);
            return;
        }

        const loadCover = async () => {
            setLoadingCover(true);
            const s3Repo = new S3Repository(creds);
            try {
                // Try to get 1080p for better quality if possible, but fallback to thumbnail
                let keyToLoad = coverKey;
                if (keyToLoad.includes('/thumbnail/')) {
                    const p1080 = S3Repository.get1080pKey(keyToLoad);
                    const exists = await s3Repo.exists(creds.bucket, p1080);
                    if (exists) keyToLoad = p1080;
                }

                const data = await s3Repo.getFile(creds.bucket, keyToLoad);
                const base64 = uint8ArrayToBase64(data);
                const url = `data:image/jpeg;base64,${base64}`;
                if (isMounted) setCoverUrl(url);
            } catch (err) {
                console.error('Failed to load cover photo', err);
            } finally {
                if (isMounted) setLoadingCover(false);
            }
        };

        loadCover();
        return () => { isMounted = false; };
    }, [album, photos, creds]);

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

    const numColumns = Math.max(3, Math.floor(width / 120));
    const itemSize = width / numColumns;

    const handlePhotoPress = useCallback((id: string, event?: any) => {
        if (Platform.OS === 'web' && event) {
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
                handleSelect(id, event);
                return;
            }
        }
        setViewerPhotoId(id);
    }, [handleSelect]);

    const handleLongPress = useCallback((id: string) => {
        toggleSelectionMode(id);
        if (Platform.OS !== 'web') {
            startDragging(id);
        }
    }, [toggleSelectionMode, startDragging]);

    const handleRemoveSelected = () => {
        setRemoveDialogVisible(true);
    };

    const confirmRemove = async () => {
        if (!album) return;
        setRemoveDialogVisible(false);
        const keysToRemove = photos
            .filter(p => selectedIds.has(p.id))
            .map(p => p.key);

        clearSelection();

        try {
            const updatedAlbum = await removePhotosFromAlbum(album.id, keysToRemove);
            setAlbum(updatedAlbum);
        } catch (err) {
            console.error('Failed to remove photos', err);
        }
    };

    if (!album && albumLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!album) {
        return (
            <View style={styles.center}>
                <Text>Album non trouvé</Text>
                <IconButton icon={() => <ArrowLeft />} onPress={() => navigation.goBack()} />
            </View>
        );
    }

    const renderHeader = () => (
        <View>
            <View style={[styles.coverContainer, { height: width * 0.6 }]}>
                {coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
                ) : (
                    <View style={styles.coverPlaceholder}>
                        {loadingCover ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Pas de couverture</Text>}
                    </View>
                )}
                <View style={styles.coverOverlay}>
                    <Text variant="headlineMedium" style={styles.albumTitle}>{album.title}</Text>
                    <Text variant="bodyMedium" style={styles.albumSubtitle}>{photos.length} photos</Text>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Appbar.Header elevated mode="center-aligned">
                {isSelectionMode ? (
                    <>
                        <Appbar.Action icon={() => <X size={24} />} onPress={clearSelection} />
                        <Appbar.Content title={`${selectedIds.size} sélectionnée(s)`} />
                        <Appbar.Action icon={() => <Trash2 size={24} color={theme.colors.error} />} onPress={handleRemoveSelected} />
                    </>
                ) : (
                    <>
                        <Appbar.BackAction onPress={() => navigation.goBack()} />
                        <Appbar.Content title={album.title} />
                        <Appbar.Action icon={() => <MoreVertical size={24} />} onPress={() => {}} />
                    </>
                )}
            </Appbar.Header>

            <FlatList
                data={photos}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={numColumns}
                ListHeaderComponent={renderHeader}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
                renderItem={({ item }) => (
                    <PhotoItem
                        photo={item}
                        creds={creds}
                        size={itemSize}
                        onPress={handlePhotoPress}
                        isSelected={selectedIds.has(item.id)}
                        onSelect={handleSelect}
                        onLongPress={handleLongPress}
                        isSelectionMode={isSelectionMode}
                        onDragStart={startDragging}
                        onDragEnter={handleDragEnter}
                        onDragEnd={stopDragging}
                    />
                )}
                contentContainerStyle={styles.listContent}
            />

            {viewerPhotoId && (
                <PhotoViewer
                    photos={photos}
                    initialPhotoId={viewerPhotoId}
                    visible={viewerPhotoId !== null}
                    onClose={() => setViewerPhotoId(null)}
                    creds={creds}
                />
            )}

            <Portal>
                <Dialog visible={removeDialogVisible} onDismiss={() => setRemoveDialogVisible(false)}>
                    <Dialog.Title>Retirer de l'album</Dialog.Title>
                    <Dialog.Content>
                        <Text>Voulez-vous retirer {selectedIds.size} photo(s) de cet album ? Les photos ne seront pas supprimées de votre galerie.</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setRemoveDialogVisible(false)}>Annuler</Button>
                        <Button onPress={confirmRemove} textColor={theme.colors.error}>Retirer</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
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
    },
    coverContainer: {
        width: '100%',
        position: 'relative',
        backgroundColor: '#000',
    },
    coverImage: {
        width: '100%',
        height: '100%',
    },
    coverPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    albumTitle: {
        color: '#fff',
        fontWeight: 'bold',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
    albumSubtitle: {
        color: '#fff',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
    listContent: {
        paddingBottom: 20,
    },
});

export default AlbumDetailScreen;
