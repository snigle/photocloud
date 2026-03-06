import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Appbar, useTheme, Text } from 'react-native-paper';
import { LogOut, RefreshCw, Upload, X, Trash2, Menu, FolderPlus } from 'lucide-react-native';

interface GalleryHeaderProps {
    selectedCount: number;
    uploading: boolean;
    refreshing?: boolean;
    progress: { current: number; total: number } | null;
    totalCount: number;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
    onUpload: () => void;
    onRefresh: () => void;
    onLogout: () => void;
    onMenu?: () => void;
    onAddToAlbum?: () => void;
    isStaging?: boolean;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
    selectedCount,
    uploading,
    refreshing,
    progress,
    totalCount,
    onClearSelection,
    onDeleteSelected,
    onUpload,
    onRefresh,
    onLogout,
    onMenu,
    onAddToAlbum,
    isStaging,
}) => {
    const theme = useTheme();

    if (selectedCount > 0) {
        return (
            <Appbar.Header style={{ backgroundColor: isStaging ? '#fff3e0' : '#e3f2fd' }}>
                <Appbar.Action icon={() => <X size={24} />} onPress={onClearSelection} testID="clear-selection-button" />
                <Appbar.Content title={`${selectedCount} sélectionné(s)`} />
                {onAddToAlbum && (
                    <Appbar.Action
                        icon={() => <FolderPlus size={24} />}
                        onPress={onAddToAlbum}
                        testID="add-to-album-button"
                        accessibilityLabel="Add to album"
                    />
                )}
                <Appbar.Action
                    icon={() => <Trash2 size={24} />}
                    onPress={onDeleteSelected}
                    testID="delete-photos-button"
                    accessibilityLabel="Delete photos"
                />
            </Appbar.Header>
        );
    }

    return (
        <Appbar.Header elevated style={{ backgroundColor: isStaging ? '#fff3e0' : undefined }}>
            {onMenu && (
                <Appbar.Action
                    icon={() => <Menu size={24} color={theme.colors.onSurface} />}
                    onPress={onMenu}
                    accessibilityLabel="Menu"
                    testID="menu-button"
                />
            )}
            <Appbar.Content
                title={
                    <View>
                        <Text style={{ fontWeight: 'bold', fontSize: 18 }}>PhotoCloud</Text>
                        <Text
                            variant="labelSmall"
                            style={{ opacity: 0.7 }}
                            testID="photo-count-subtitle"
                        >
                            {refreshing ? 'Mise à jour...' : (uploading && progress ? `Uploading ${progress.current}/${progress.total}...` : `${totalCount} photos`)}
                        </Text>
                    </View>
                }
                testID="gallery-header-content"
            />
            {uploading && !progress && <ActivityIndicator style={{ marginRight: 10 }} color={theme.colors.primary} />}
            <Appbar.Action
                icon={() => <Upload size={24} color={theme.colors.onSurface} />}
                onPress={onUpload}
                disabled={uploading}
                testID="upload-button"
                accessibilityLabel="Upload"
            />
            <Appbar.Action icon={() => <RefreshCw size={24} color={theme.colors.onSurface} />} onPress={onRefresh} />
            <Appbar.Action icon={() => <LogOut size={24} color={theme.colors.onSurface} />} onPress={onLogout} />
        </Appbar.Header>
    );
};
