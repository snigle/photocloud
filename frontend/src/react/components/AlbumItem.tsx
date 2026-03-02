import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme } from 'react-native-paper';
import { Album, S3Credentials } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';
import { uint8ArrayToBase64 } from '../../infra/utils';
import { ThumbnailCache } from '../../infra/thumbnail-cache';

interface AlbumItemProps {
    album: Album;
    creds: S3Credentials;
    size: number;
    onPress: (album: Album) => void;
}

export const AlbumItem: React.FC<AlbumItemProps> = ({ album, creds, size, onPress }) => {
    const theme = useTheme();
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (!album.coverPhotoKey) {
            setThumbnailUrl(null);
            return;
        }

        const cached = ThumbnailCache.get(album.coverPhotoKey);
        if (cached?.displayUrl) {
            setThumbnailUrl(cached.displayUrl);
            return;
        }

        const loadThumbnail = async () => {
            setLoading(true);
            const s3Repo = new S3Repository(creds);
            try {
                // Ensure we use the thumbnail key for the cover
                let coverKey = album.coverPhotoKey!;
                if (!coverKey.includes('/thumbnail/')) {
                    // If it's an original/1080p key, try to use the thumbnail one
                    coverKey = coverKey.replace('/original/', '/thumbnail/').replace('/1080p/', '/thumbnail/');
                }

                const data = await s3Repo.getFile(creds.bucket, coverKey);
                const base64 = uint8ArrayToBase64(data);
                const displayUrl = `data:image/jpeg;base64,${base64}`;
                ThumbnailCache.set(album.coverPhotoKey!, { data, displayUrl });
                if (isMounted) setThumbnailUrl(displayUrl);
            } catch (err) {
                console.error('Failed to load album cover', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadThumbnail();
        return () => { isMounted = false; };
    }, [album.coverPhotoKey, creds]);

    return (
        <TouchableOpacity onPress={() => onPress(album)} style={[styles.container, { width: size }]}>
            <Card style={styles.card}>
                <View style={[styles.imageContainer, { height: size - 40 }]}>
                    {thumbnailUrl ? (
                        <Image source={{ uri: thumbnailUrl }} style={styles.image} resizeMode="cover" />
                    ) : (
                        <View style={styles.placeholder}>
                            {loading ? <ActivityIndicator size="small" /> : <Text variant="headlineSmall" style={{ opacity: 0.3 }}>📁</Text>}
                        </View>
                    )}
                </View>
                <View style={styles.content}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>{album.title}</Text>
                    <Text variant="bodySmall" style={styles.subtitle}>{album.photoCount ?? album.photoKeys?.length ?? 0} photos</Text>
                </View>
            </Card>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 8,
    },
    card: {
        overflow: 'hidden',
        elevation: 2,
    },
    imageContainer: {
        width: '100%',
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    content: {
        padding: 8,
        height: 50,
        justifyContent: 'center',
    },
    title: {
        fontWeight: 'bold',
    },
    subtitle: {
        opacity: 0.7,
    }
});
