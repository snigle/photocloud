import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, useWindowDimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { Appbar, Text, useTheme, Button, Portal, Dialog } from 'react-native-paper';
import { Menu, RefreshCw } from 'lucide-react-native';
import { FolderItem } from '../components/FolderItem';
import { getIsStaging } from '../utils/routing-utils';
import { GetFoldersUseCase } from '../../usecase/get-folders.usecase';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { SyncSettingsRepository } from '../../infra/sync-settings.repository';
import { Folder } from '../../domain/types';
import * as MediaLibrary from 'expo-media-library';

interface FoldersScreenProps {
  navigation: any;
}

const FoldersScreen: React.FC<FoldersScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const isStaging = getIsStaging();
  const { width } = useWindowDimensions();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [enabledFolders, setEnabledFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionDialogVisible, setPermissionDialogVisible] = useState(false);

  const localRepo = useMemo(() => new LocalGalleryRepository(), []);
  const syncSettingsRepo = useMemo(() => new SyncSettingsRepository(), []);
  const getFoldersUseCase = useMemo(() => new GetFoldersUseCase(localRepo), [localRepo]);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDialogVisible(true);
      setLoading(false);
      return;
    }

    const fetchedFolders = await getFoldersUseCase.execute();
    const settings = await syncSettingsRepo.getSettings();

    // Select main photos folder by default if nothing is selected
    if (settings.enabledFolders.length === 0 && fetchedFolders.length > 0) {
        const dcim = fetchedFolders.find(a => a.title.toLowerCase() === 'dcim' || a.title.toLowerCase() === 'camera');
        if (dcim) {
            settings.enabledFolders = [dcim.id];
            await syncSettingsRepo.saveSettings(settings);
        }
    }

    setFolders(fetchedFolders);
    setEnabledFolders(settings.enabledFolders);
    setLoading(false);
    setRefreshing(false);
  }, [getFoldersUseCase, syncSettingsRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (folderId: string) => {
    await syncSettingsRepo.toggleFolder(folderId);
    const settings = await syncSettingsRepo.getSettings();
    setEnabledFolders(settings.enabledFolders);
  };

  const numColumns = Math.max(2, Math.floor(width / 150));
  const itemSize = (width - 16) / numColumns;

  return (
    <View style={styles.container}>
      <Appbar.Header elevated style={{ backgroundColor: isStaging ? '#fff3e0' : undefined }}>
        <Appbar.Action icon={() => <Menu size={24} />} onPress={() => navigation.openDrawer()} />
        <Appbar.Content title="Dossiers" subtitle={refreshing ? 'Mise à jour...' : 'Synchronisation'} />
        <Appbar.Action icon={() => <RefreshCw size={24} />} onPress={() => loadData(true)} disabled={refreshing} />
      </Appbar.Header>

      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={({ item }) => (
          <FolderItem
            folder={item}
            isEnabled={enabledFolders.includes(item.id)}
            onToggle={handleToggle}
            size={itemSize}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        alwaysBounceVertical={true}
        overScrollMode="always"
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
        ListEmptyComponent={
            loading && folders.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={{ marginTop: 16 }}>Chargement des dossiers...</Text>
                </View>
            ) : !loading && folders.length === 0 ? (
                <View style={styles.center}>
                    <Text>Aucun dossier trouvé ou permission refusée.</Text>
                    <Button mode="contained" onPress={loadData} style={{ marginTop: 16 }}>
                        Réessayer
                    </Button>
                </View>
            ) : null
        }
      />

      <Portal>
        <Dialog visible={permissionDialogVisible} onDismiss={() => setPermissionDialogVisible(false)}>
          <Dialog.Title>Permission requise</Dialog.Title>
          <Dialog.Content>
            <Text>L'application a besoin d'accéder à vos photos pour afficher les dossiers et les synchroniser.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPermissionDialogVisible(false)}>Annuler</Button>
            <Button onPress={() => {
                setPermissionDialogVisible(false);
                loadData();
            }}>Donner l'accès</Button>
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
});

export default FoldersScreen;
