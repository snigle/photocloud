import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface SyncProgress {
    synced: number;
    total: number;
    isSyncing: boolean;
}

interface SyncContextType {
    progress: SyncProgress;
    updateProgress: (synced: number, total: number) => void;
    setSyncing: (isSyncing: boolean) => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [progress, setProgress] = useState<SyncProgress>({
        synced: 0,
        total: 0,
        isSyncing: false,
    });

    const updateProgress = useCallback((synced: number, total: number) => {
        setProgress(prev => ({ ...prev, synced, total }));
    }, []);

    const setSyncing = useCallback((isSyncing: boolean) => {
        setProgress(prev => ({ ...prev, isSyncing }));
    }, []);

    const value = useMemo(() => ({
        progress,
        updateProgress,
        setSyncing
    }), [progress, updateProgress, setSyncing]);

    return (
        <SyncContext.Provider value={value}>
            {children}
        </SyncContext.Provider>
    );
};

export const useSync = () => {
    const context = useContext(SyncContext);
    if (context === undefined) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
};
