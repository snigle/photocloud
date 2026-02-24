import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { Photo } from '../../domain/types';

export const useSelection = (photos: Photo[]) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleSelect = useCallback((id: string, event?: any) => {
        const isShift = Platform.OS === 'web' && (event?.shiftKey || event?.nativeEvent?.shiftKey);

        setSelectedIds(prev => {
            const next = new Set(prev);
            if (isShift && lastSelectedId) {
                const currentIndex = photos.findIndex(p => p.id === id);
                const lastIndex = photos.findIndex(p => p.id === lastSelectedId);
                if (currentIndex !== -1 && lastIndex !== -1) {
                    const start = Math.min(currentIndex, lastIndex);
                    const end = Math.max(currentIndex, lastIndex);
                    for (let i = start; i <= end; i++) {
                        next.add(photos[i].id);
                    }
                }
            } else {
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            }
            return next;
        });
        setLastSelectedId(id);
    }, [photos, lastSelectedId]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setLastSelectedId(null);
    }, []);

    const toggleSelectionMode = useCallback((id: string) => {
        setSelectedIds(new Set([id]));
        setLastSelectedId(id);
    }, []);

    const startDragging = useCallback((id: string) => {
        setIsDragging(true);
        // Ensure the starting id is selected without toggling it off if it was already selected
        setSelectedIds(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        setLastSelectedId(id);
    }, []);

    const stopDragging = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDragEnter = useCallback((id: string) => {
        if (isDragging) {
            handleSelect(id, { shiftKey: true }); // Use range selection logic for dragging
        }
    }, [isDragging, handleSelect]);

    return {
        selectedIds,
        handleSelect,
        clearSelection,
        toggleSelectionMode,
        isSelectionMode: selectedIds.size > 0,
        isDragging,
        startDragging,
        stopDragging,
        handleDragEnter
    };
};
