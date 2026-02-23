import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Image, Dimensions, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { Appbar, Button, Text, useTheme } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import * as ImageManipulator from 'expo-image-manipulator';
import { Crop } from 'lucide-react-native';
import type { Photo } from '../../domain/types';

interface EditScreenProps {
  photo: Photo;
  uri: string; // Local URI of the image to edit
  visible: boolean;
  onClose: () => void;
  onSave: (uri: string) => void;
}

const { width } = Dimensions.get('window');

export const EditScreen: React.FC<EditScreenProps> = ({ photo, uri, visible, onClose, onSave }) => {
  const theme = useTheme();
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [processing, setProcessing] = useState(false);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleCropSquare = async () => {
    setProcessing(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: 0, originY: 0, width: 1000, height: 1000 } }], // Simple example crop
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      onSave(result.uri);
    } catch (err) {
        console.error('Failed to crop', err);
    } finally {
        setProcessing(false);
    }
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      const actions: ImageManipulator.Action[] = [];
      if (rotation !== 0) {
        actions.push({ rotate: rotation });
      }

      // Note: ImageManipulator doesn't support brightness/contrast natively.
      // For this POC, we use CSS filters for web preview.
      // Saving these would require a Canvas-based approach or a more advanced native library.

      const result = await ImageManipulator.manipulateAsync(
        uri,
        actions,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      onSave(result.uri);
    } catch (err) {
      console.error('Failed to save edit', err);
    } finally {
      setProcessing(false);
    }
  };

  const imageStyle = Platform.OS === 'web' ? {
      filter: `brightness(${brightness}%) contrast(${contrast}%)`,
      transform: `rotate(${rotation}deg)`,
  } as any : {
      transform: [{ rotate: `${rotation}deg` }],
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <Appbar.Header elevated>
          <Appbar.BackAction onPress={onClose} disabled={processing} />
          <Appbar.Content title="Edit Photo" />
          <Button mode="text" onPress={handleSave} loading={processing} disabled={processing}>
            Save
          </Button>
        </Appbar.Header>

        <View style={styles.previewContainer}>
          <Image
            source={{ uri }}
            style={[styles.preview, imageStyle]}
            resizeMode="contain"
          />
        </View>

        <ScrollView style={styles.controls}>
          <View style={styles.controlGroup}>
            <Text variant="labelLarge">Brightness</Text>
            <Slider
              value={brightness}
              minimumValue={0}
              maximumValue={200}
              step={1}
              onValueChange={setBrightness}
              thumbColor={theme.colors.primary}
              minimumTrackTintColor={theme.colors.primary}
            />
          </View>

          <View style={styles.controlGroup}>
            <Text variant="labelLarge">Contrast</Text>
            <Slider
              value={contrast}
              minimumValue={0}
              maximumValue={200}
              step={1}
              onValueChange={setContrast}
              thumbColor={theme.colors.primary}
              minimumTrackTintColor={theme.colors.primary}
            />
          </View>

          <View style={styles.actions}>
            <Button icon="rotate-right" mode="outlined" onPress={handleRotate}>
              Rotate
            </Button>
            <Button icon={() => <Crop size={18} color={theme.colors.primary} />} mode="outlined" onPress={handleCropSquare}>
              Square Crop
            </Button>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  previewContainer: {
    flex: 2,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: {
    width: width - 40,
    height: '100%',
  },
  controls: {
    flex: 1,
    padding: 20,
  },
  controlGroup: {
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  }
});
