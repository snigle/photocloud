import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Portal, Dialog, Button, Text, TextInput, List, Divider } from 'react-native-paper';
import { Plus, Check } from 'lucide-react-native';
import { Album, S3Credentials } from '../../domain/types';
import { useAlbums } from '../hooks/useAlbums';

interface AddToAlbumDialogProps {
    visible: boolean;
    onDismiss: () => void;
    creds: S3Credentials;
    email: string;
    photoKeys: string[];
}

export const AddToAlbumDialog: React.FC<AddToAlbumDialogProps> = ({ visible, onDismiss, creds, email, photoKeys }) => {
    const { albums, loading, createAlbum, addPhotosToAlbum } = useAlbums(creds, email);
    const [newAlbumTitle, setNewAlbumTitle] = useState('');
    const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
    const [processing, setProcessing] = useState(false);

    const handleCreateAlbum = async () => {
        if (!newAlbumTitle.trim()) return;
        setProcessing(true);
        try {
            await createAlbum(newAlbumTitle.trim(), photoKeys);
            onDismiss();
            setNewAlbumTitle('');
            setShowNewAlbumInput(false);
        } catch (err) {
            console.error('Failed to create album', err);
        } finally {
            setProcessing(false);
        }
    };

    const handleAddToAlbum = async (albumId: string) => {
        setProcessing(true);
        try {
            await addPhotosToAlbum(albumId, photoKeys);
            onDismiss();
        } catch (err) {
            console.error('Failed to add photos to album', err);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Portal>
            <Dialog visible={visible} onDismiss={onDismiss}>
                <Dialog.Title>Ajouter aux albums</Dialog.Title>
                <Dialog.ScrollArea style={styles.scrollArea}>
                    {loading && albums.length === 0 ? (
                        <ActivityIndicator size="large" style={{ margin: 20 }} />
                    ) : (
                        <FlatList
                            data={albums}
                            keyExtractor={(item) => item.id}
                            ListHeaderComponent={
                                <>
                                    <List.Item
                                        title="Nouvel album"
                                        left={props => <Plus size={24} {...props} />}
                                        onPress={() => setShowNewAlbumInput(true)}
                                    />
                                    {showNewAlbumInput && (
                                        <View style={styles.newAlbumInput}>
                                            <TextInput
                                                label="Titre de l'album"
                                                value={newAlbumTitle}
                                                onChangeText={setNewAlbumTitle}
                                                mode="outlined"
                                                autoFocus
                                                right={<TextInput.Icon icon={() => <Check size={24} />} onPress={handleCreateAlbum} />}
                                            />
                                            <View style={styles.inputActions}>
                                                <Button onPress={() => setShowNewAlbumInput(false)}>Annuler</Button>
                                                <Button onPress={handleCreateAlbum} loading={processing} disabled={!newAlbumTitle.trim()}>Créer</Button>
                                            </View>
                                        </View>
                                    )}
                                    <Divider />
                                </>
                            }
                            renderItem={({ item }) => (
                                <List.Item
                                    title={item.title}
                                    description={`${item.photoKeys.length} photos`}
                                    onPress={() => handleAddToAlbum(item.id)}
                                    disabled={processing}
                                />
                            )}
                            ListEmptyComponent={
                                !loading && albums.length === 0 ? (
                                    <View style={styles.empty}>
                                        <Text>Aucun album créé pour l'instant.</Text>
                                    </View>
                                ) : null
                            }
                        />
                    )}
                </Dialog.ScrollArea>
                <Dialog.Actions>
                    <Button onPress={onDismiss}>Fermer</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
};

const styles = StyleSheet.create({
    scrollArea: {
        maxHeight: 400,
        paddingHorizontal: 0,
    },
    newAlbumInput: {
        padding: 16,
        backgroundColor: '#f9f9f9',
    },
    inputActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    empty: {
        padding: 20,
        alignItems: 'center',
    }
});
