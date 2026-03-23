import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { S3Credentials, Photo } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { GalleryUseCase } from '../../usecase/gallery.usecase';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<(Photo | null)[]>([]);
  const [cloudIndex, setCloudIndex] = useState<{ years: { year: string, count: number }[] }>({ years: [] });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const syncPromise = useRef<Promise<void> | null>(null);
  const isInitialLoadRunning = useRef(false);
  const syncStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE_SIZE = 100;
  const SYNC_DELAY_WHEN_GALLERY_READY_MS = 5000;
  const SYNC_DELAY_WHEN_GALLERY_EMPTY_MS = 400;

  const galleryUseCase = useMemo(() => {
    if (!creds) return null;
    return new GalleryUseCase(new S3Repository(creds), new LocalGalleryRepository());
  }, [creds]);

  const photosRef = useRef<(Photo | null)[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const performSync = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    if (syncPromise.current) {
        console.log('useGallery: Joining existing sync promise');
        return syncPromise.current;
    }

    syncPromise.current = (async () => {
        console.log('useGallery: Starting synchronization');
      setSyncing(true);
        try {
            await galleryUseCase.sync(creds, email);

            console.log('useGallery: Sync complete, refreshing UI from local cache');
            const refreshed = await galleryUseCase.getPhotos(100000, 0);
            const count = await galleryUseCase.getTotalCount();
            const sorted = [...refreshed].sort((a, b) => b.creationDate - a.creationDate);

            setPhotos(sorted);
            setTotalCount(count);

            const updatedIndex = await galleryUseCase.getCloudIndex(creds, email);
            setCloudIndex(updatedIndex);
        } catch (err) {
            console.warn('useGallery: Sync failed', err);
            throw err;
        } finally {
          setSyncing(false);
            syncPromise.current = null;
        }
    })();

    return syncPromise.current;
  }, [galleryUseCase, creds, email]);

  const scheduleBackgroundSync = useCallback((hasImmediateGallery: boolean) => {
    if (syncStartTimerRef.current) {
      clearTimeout(syncStartTimerRef.current);
      syncStartTimerRef.current = null;
    }

    const delayMs = hasImmediateGallery
      ? SYNC_DELAY_WHEN_GALLERY_READY_MS
      : SYNC_DELAY_WHEN_GALLERY_EMPTY_MS;

    syncStartTimerRef.current = setTimeout(() => {
      syncStartTimerRef.current = null;
      void performSync().catch(() => {});
    }, delayMs);
  }, [performSync]);

  const loadInitial = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    if (isInitialLoadRunning.current) return;
    isInitialLoadRunning.current = true;

    if (photosRef.current.length === 0) {
        setLoading(true);
    }

    try {
      // 1. Load only first page from cache for fast first paint
      const cachedPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, 0);
      const totalInCache = await galleryUseCase.getTotalCount();
      const hasImmediateGallery = cachedPhotos.length > 0;

      if (cachedPhotos.length > 0) {
          setPhotos(cachedPhotos);
          setTotalCount(totalInCache);
          setHasMore(totalInCache > cachedPhotos.length);
        } else {
          // If the merged cache is empty, show local device photos first while full sync runs.
          void (async () => {
            try {
              const localRepo = new LocalGalleryRepository();
              let localPhotos = await localRepo.listLocalPhotos(true);
              if (localPhotos.length === 0) {
                localPhotos = await localRepo.listLocalPhotos(false);
              }

              if (photosRef.current.length === 0 && localPhotos.length > 0) {
                const sorted = [...localPhotos].sort((a, b) => b.creationDate - a.creationDate);
                const firstPage = sorted.slice(0, PAGE_SIZE);
                setPhotos(firstPage);
                setTotalCount(sorted.length);
                setHasMore(sorted.length > firstPage.length);
              }
            } catch (e) {
              console.warn('useGallery: local-first preload failed', e);
            }
          })();
      }

      // 2. Continue expensive work in background to keep UI responsive
      void galleryUseCase
        .getCloudIndex(creds, email)
        .then(setCloudIndex)
        .catch((err: any) => setError(err?.message || 'Failed to fetch cloud index'));

      // 3. Start sync with delay so the gallery render remains prioritized.
      scheduleBackgroundSync(hasImmediateGallery);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
      isInitialLoadRunning.current = false;
    }
  }, [galleryUseCase, creds, email, scheduleBackgroundSync]);

  const loadMore = useCallback(async () => {
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.race([
        performSync(),
        new Promise<void>(resolve => setTimeout(resolve, 10000)),
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh photos');
    } finally {
      setRefreshing(false);
    }
  }, [performSync]);

  const addPhoto = useCallback(async (photo: Photo) => {
    // Persist to local cache
    const localRepo = new LocalGalleryRepository();
    await localRepo.savePhoto(photo);

    setTotalCount(prev => prev + 1);
    setPhotos(prev => {
        if (prev.find(p => p && p.id === photo.id)) return prev;

        // Fast path: if it's newer than the first photo, just prepend
        if (prev.length === 0 || (prev[0] && photo.creationDate >= prev[0].creationDate)) {
            return [photo, ...prev];
        }

        // Slow path: insert and sort
        const newPhotos = [photo, ...prev];
        return newPhotos.sort((a, b) => {
            if (!a) return 1;
            if (!b) return -1;
            return b.creationDate - a.creationDate;
        });
    });
  }, []);

  const deletePhotos = useCallback(async (ids: string[]) => {
      if (!galleryUseCase || !creds) return;

      const photosToDelete = photosRef.current.filter(p => p && ids.includes(p.id)) as Photo[];

      // Update UI optimistically
      setPhotos(prev => prev.filter(p => !p || !ids.includes(p.id)));
      setTotalCount(prev => Math.max(0, prev - ids.length));

      try {
          for (const photo of photosToDelete) {
              await galleryUseCase.deletePhoto(creds, photo);
          }
      } catch (err: any) {
          setError(err.message || 'Failed to delete some photos');
          // Refresh to get consistent state
          refresh();
      }
  }, [galleryUseCase, creds, refresh]);

  const pruneMissingCloudPhoto = useCallback(async (id: string) => {
    setPhotos(prev => prev.filter(p => !p || p.id !== id));
    setTotalCount(prev => Math.max(0, prev - 1));

    try {
      const localRepo = new LocalGalleryRepository();
      await localRepo.deleteFromCache(id);
    } catch (e) {
      console.warn('useGallery: failed to prune missing cloud photo from cache', e);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    return () => {
      if (syncStartTimerRef.current) {
        clearTimeout(syncStartTimerRef.current);
        syncStartTimerRef.current = null;
      }
    };
  }, []);

  return { photos, totalCount, cloudIndex, loading, refreshing, syncing, error, refresh, loadMore, hasMore, addPhoto, deletePhotos, pruneMissingCloudPhoto };
};
