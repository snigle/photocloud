import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text, Checkbox, Surface } from 'react-native-paper';
import { Folder } from '../../domain/types';

interface FolderItemProps {
  folder: Folder;
  isEnabled: boolean;
  onToggle: (folderId: string) => void;
  size: number;
}

export const FolderItem: React.FC<FolderItemProps> = ({ folder, isEnabled, onToggle, size }) => {
  return (
    <Surface style={[styles.container, { width: size, height: size }]} elevation={1}>
      <TouchableOpacity style={styles.touchable} onPress={() => onToggle(folder.id)}>
        {folder.lastPhoto ? (
          <Image
            source={{ uri: folder.lastPhoto.uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder} />
        )}
        <View style={styles.overlay}>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{folder.title}</Text>
            <Text style={styles.count}>{folder.count} photos</Text>
          </View>
          <Checkbox
            status={isEnabled ? 'checked' : 'unchecked'}
            onPress={() => onToggle(folder.id)}
            color="#fff"
            uncheckedColor="#fff"
          />
        </View>
      </TouchableOpacity>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  touchable: {
    flex: 1,
  },
  thumbnail: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#eee',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  count: {
    color: '#fff',
    fontSize: 12,
  },
});
