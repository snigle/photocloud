import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { LogOut, RefreshCw, Upload, X, Trash2 } from 'lucide-react-native';

interface GalleryHeaderProps {
    selectedCount: number;
    uploading: boolean;
    progress: { current: number; total: number } | null;
    totalCount: number;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
    onUpload: () => void;
    onRefresh: () => void;
    onLogout: () => void;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
    selectedCount,
    uploading,
    progress,
    totalCount,
    onClearSelection,
    onDeleteSelected,
    onUpload,
    onRefresh,
    onLogout,
}) => {
    const theme = useTheme();

    if (selectedCount > 0) {
        return (
            <Appbar.Header style={{ backgroundColor: '#e3f2fd' }}>
                <Appbar.Action icon={() => <X size={24} />} onPress={onClearSelection} />
                <Appbar.Content title={`${selectedCount} sélectionné(s)`} />
                <Appbar.Action icon={() => <Trash2 size={24} />} onPress={onDeleteSelected} />
            </Appbar.Header>
        );
    }

    return (
        <Appbar.Header elevated>
            <Appbar.Content
                title="PhotoCloud"
                subtitle={uploading && progress ? `Uploading ${progress.current}/${progress.total}...` : `${totalCount} photos`}
            />
            {uploading && !progress && <ActivityIndicator style={{ marginRight: 10 }} color={theme.colors.primary} />}
            <Appbar.Action
                icon={() => <Upload size={24} color={theme.colors.onSurface} />}
                onPress={onUpload}
                disabled={uploading}
            />
            <Appbar.Action icon={() => <RefreshCw size={24} color={theme.colors.onSurface} />} onPress={onRefresh} />
            <Appbar.Action icon={() => <LogOut size={24} color={theme.colors.onSurface} />} onPress={onLogout} />
        </Appbar.Header>
    );
};
