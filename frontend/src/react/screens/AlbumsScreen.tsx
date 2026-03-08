import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useWindowDimensions, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { Appbar, useTheme, Text, Button, FAB } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Plus, RefreshCw } from 'lucide-react-native';
import { useAlbums } from '../hooks/useAlbums';
import { getIsStaging } from '../utils/routing-utils';
import { AlbumItem } from '../components/AlbumItem';
import { Album, S3Credentials } from '../../domain/types';

interface AlbumsScreenProps {
    navigation: any;
    creds: S3Credentials;
    email: string;
}

const AlbumsScreen: React.FC<AlbumsScreenProps> = ({ navigation, creds, email }) => {
    const theme = useTheme();
    const isStaging = getIsStaging();
    const { width } = useWindowDimensions();
    const { albums, loading, refreshing, error, refresh, createAlbum } = useAlbums(creds, email);
    const [isCreating, setIsCreating] = useState(false);


    const numColumns = Math.max(2, Math.floor(width / 180));
    const itemSize = width / numColumns;

    const handleAlbumPress = (album: Album) => {
        navigation.navigate('AlbumDetail', { albumId: album.id, album, shareKey: album.shareKey });
    };

    const handleCreateNewAlbum = async () => {
        // In a real app, show a dialog to get the title.
        // For now, let's keep it simple or implement it with a simple prompt if possible,
        // but for better UX, a dialog is preferred.
        // Actually, the user can create albums via the "Add to album" flow in Gallery.
        // I'll add a simple "New Album" FAB here for completeness.

        // Let's assume for now we just show a placeholder or we can add a dialog here too.
        setIsCreating(true);
        try {
            const title = `Nouvel Album ${albums.length + 1}`;
            await createAlbum(title);
            refresh();
        } catch (err) {
            console.error('Failed to create album', err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <View style={styles.container}>
            <Appbar.Header elevated style={{ backgroundColor: isStaging ? '#fff3e0' : undefined }}>
                <Appbar.Action
                    icon={() => <Menu size={24} />}
                    onPress={() => navigation.openDrawer()}
                    testID="menu-button"
                    accessibilityLabel="Menu"
                />
                <Appbar.Content title="Albums" subtitle={refreshing ? 'Mise à jour...' : undefined} />
                <Appbar.Action icon={() => <RefreshCw size={24} />} onPress={refresh} disabled={refreshing} />
                <Appbar.Action icon={() => <Plus size={24} />} onPress={handleCreateNewAlbum} disabled={isCreating} />
            </Appbar.Header>

            <View style={styles.content}>
                <FlatList
                    data={albums}
                    keyExtractor={(item) => item.id}
                    numColumns={numColumns}
                    key={numColumns}
                    renderItem={({ item }) => (
                        <AlbumItem
                            album={item}
                            creds={creds}
                            size={itemSize}
                            onPress={handleAlbumPress}
                        />
                    )}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={refresh}
                            colors={[theme.colors.primary]}
                            tintColor={theme.colors.primary}
                        />
                    }
                    alwaysBounceVertical={true}
                    overScrollMode="always"
                    contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
                    ListEmptyComponent={
                        loading && albums.length === 0 ? (
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color={theme.colors.primary} />
                                <Text style={{ marginTop: 16 }}>Chargement des albums...</Text>
                            </View>
                        ) : !loading ? (
                            <View style={styles.center}>
                                <Text variant="headlineSmall" style={{ marginBottom: 8 }}>📁</Text>
                                <Text>Aucun album trouvé.</Text>
                                <Text variant="bodySmall">Créez votre premier album depuis la galerie ou ici même.</Text>
                                <Button mode="contained" onPress={handleCreateNewAlbum} style={{ marginTop: 16 }}>
                                    Créer un album
                                </Button>
                            </View>
                        ) : null
                    }
                />
            </View>

            {error && (
                <View style={styles.errorBanner}>
                    <Text style={{ color: theme.colors.error }}>{error}</Text>
                    <Button onPress={refresh}>Réessayer</Button>
                </View>
            )}

            <FAB
                icon={() => <Plus size={24} color={theme.colors.onPrimaryContainer} />}
                style={styles.fab}
                onPress={handleCreateNewAlbum}
                loading={isCreating}
                disabled={isCreating}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    content: {
        flex: 1,
    },
    list: {
        padding: 4,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        marginTop: 100,
    },
    errorBanner: {
        backgroundColor: '#fee',
        padding: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});

export default AlbumsScreen;
