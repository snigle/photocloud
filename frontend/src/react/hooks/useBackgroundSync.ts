import { useEffect, useRef, useMemo } from 'react';
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

    useEffect(() => {
        if (Platform.OS === 'web' || !session || !syncUseCase) return;

        let isMounted = true;

        const runSync = async () => {
            if (isForegroundSyncing.current) return;
            isForegroundSyncing.current = true;
            setSyncing(true);

            try {
                // Continuous sync while app is open
                // We run in a loop with a small delay between batches if needed,
                // but execute() now supports running until completion if stopOnMax is false.
                await syncUseCase.execute(
                    session.creds,
                    session.email,
                    (synced, total) => {
                        if (isMounted) updateProgress(synced, total);
                    },
                    false // stopOnMax = false for foreground sync
                );
            } catch (error) {
                console.error('Foreground sync failed:', error);
            } finally {
                if (isMounted) {
                    setSyncing(false);
                    isForegroundSyncing.current = false;
                }
            }
        };

        runSync();

        // Optional: setup a timer to re-check every few minutes if new photos arrived
        const interval = setInterval(runSync, 5 * 60 * 1000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [session, syncUseCase, updateProgress, setSyncing]);
};
