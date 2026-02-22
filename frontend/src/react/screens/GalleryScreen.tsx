import React from 'react';
import { View, StyleSheet, FlatList, Image, Dimensions, RefreshControl } from 'react-native';
import { Appbar, Card, Text, useTheme, ActivityIndicator } from 'react-native-paper';
import { LogOut, RefreshCw } from 'lucide-react-native';
import { useGallery } from '../hooks/useGallery';
import type { S3Credentials } from '../domain/types';

interface Props {
  creds: S3Credentials;
  email: string;
  onLogout: () => void;
}

const { width } = Dimensions.get('window');
const columnCount = width > 600 ? 4 : 2;
const itemSize = (width - 40) / columnCount;

const GalleryScreen: React.FC<Props> = ({ creds, email, onLogout }) => {
  const theme = useTheme();
  const { photos, loading, error, refresh } = useGallery(creds, email);

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.Content title="My Gallery" subtitle={email} />
        <Appbar.Action icon={() => <RefreshCw size={24} color={theme.colors.onSurface} />} onPress={refresh} />
        <Appbar.Action icon={() => <LogOut size={24} color={theme.colors.onSurface} />} onPress={onLogout} />
      </Appbar.Header>

      {error && (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.error }}>{error}</Text>
        </View>
      )}

      {!loading && photos.length === 0 && !error && (
        <View style={styles.center}>
          <Text>No photos found in your cloud.</Text>
        </View>
      )}

      <FlatList
        data={photos}
        keyExtractor={(item) => item.key}
        numColumns={columnCount}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        renderItem={({ item }) => (
          <Card style={[styles.photoCard, { width: itemSize, height: itemSize + 40 }]}>
            <Image
              source={{ uri: item.url }}
              style={[styles.image, { height: itemSize }]}
              resizeMode="cover"
            />
            <View style={styles.photoInfo}>
              <Text numberOfLines={1} variant="labelSmall">
                {item.key.split('/').pop()}
              </Text>
            </View>
          </Card>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    padding: 10,
  },
  photoCard: {
    margin: 5,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
  },
  photoInfo: {
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default GalleryScreen;
