import { useEffect, useRef, useMemo, useCallback } from 'react';
import { Platform } from 'react-native';
import { useSync } from './useSync';
import { SyncPhotosUseCase } from '../../usecase/sync-photos.usecase';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { SyncSettingsRepository } from '../../infra/sync-settings.repository';
import type { S3Credentials } from '../../domain/types';

export const useBackgroundSync = (session: { creds: S3Credentials, email: string } | null) => {
    const { updateProgress, setSyncing } = useSync();
    const isForegroundSyncing = useRef(false);

    const syncUseCase = useMemo(() => {
        if (!session) return null;
        return new SyncPhotosUseCase(
            new S3Repository(session.creds),
            new LocalGalleryRepository(),
            new SyncSettingsRepository()
        );
    }, [session]);

    const triggerSync = useCallback(async (stopOnMax: boolean = false): Promise<number> => {
        if (Platform.OS === 'web' || !session || !syncUseCase) return 0;
        if (isForegroundSyncing.current) return 0;

        isForegroundSyncing.current = true;
        setSyncing(true);

        try {
            return await syncUseCase.execute(
                session.creds,
                session.email,
                (synced, total) => updateProgress(synced, total),
                stopOnMax
            );
        } catch (error) {
            console.error('Foreground sync failed:', error);
            return 0;
        } finally {
            setSyncing(false);
            isForegroundSyncing.current = false;
        }
    }, [session, syncUseCase, setSyncing, updateProgress]);

    useEffect(() => {
        if (Platform.OS === 'web' || !session || !syncUseCase) return;

        let isMounted = true;

        const runSync = async () => {
            if (!isMounted) return;
            await triggerSync(false);
        };

        void runSync();

        // Optional: setup a timer to re-check every few minutes if new photos arrived
        const interval = setInterval(runSync, 5 * 60 * 1000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [session, syncUseCase, triggerSync]);

    return {
        triggerSync,
        isSyncSupported: Platform.OS !== 'web' && !!session && !!syncUseCase,
    };
};
