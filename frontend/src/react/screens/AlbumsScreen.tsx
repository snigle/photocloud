import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useWindowDimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { Appbar, useTheme, Text, Button, FAB } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Plus } from 'lucide-react-native';
import { useAlbums } from '../hooks/useAlbums';
import { AlbumItem } from '../components/AlbumItem';
import { Album, S3Credentials } from '../../domain/types';

interface AlbumsScreenProps {
    navigation: any;
    creds: S3Credentials;
    email: string;
}

const AlbumsScreen: React.FC<AlbumsScreenProps> = ({ navigation, creds, email }) => {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const { albums, loading, error, refresh, createAlbum } = useAlbums(creds, email);
    const [isCreating, setIsCreating] = useState(false);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    const numColumns = Math.max(2, Math.floor(width / 180));
    const itemSize = width / numColumns;

    const handleAlbumPress = (album: Album) => {
        navigation.navigate('AlbumDetail', { albumId: album.id, album });
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
            <Appbar.Header elevated>
                <Appbar.Action icon={() => <Menu size={24} />} onPress={() => navigation.openDrawer()} />
                <Appbar.Content title="Albums" />
                <Appbar.Action icon={() => <Plus size={24} />} onPress={handleCreateNewAlbum} disabled={isCreating} />
            </Appbar.Header>

            <View style={styles.content}>
                {loading && albums.length === 0 ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                        <Text style={{ marginTop: 16 }}>Chargement des albums...</Text>
                    </View>
                ) : (
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
                        contentContainerStyle={styles.list}
                        refreshControl={
                            <RefreshControl refreshing={loading} onRefresh={refresh} />
                        }
                        ListEmptyComponent={
                            !loading ? (
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
                )}
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
