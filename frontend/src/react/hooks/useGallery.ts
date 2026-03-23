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
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const isSyncing = useRef(false);
  const syncPromise = useRef<Promise<void> | null>(null);

  const PAGE_SIZE = 100;

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
        isSyncing.current = true;
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
            isSyncing.current = false;
            syncPromise.current = null;
        }
    })();

    return syncPromise.current;
  }, [galleryUseCase, creds, email]);

  const loadInitial = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;

    if (photosRef.current.length === 0) {
        setLoading(true);
    }

    try {
      // 1. Load from cache first
      const cachedPhotos = await galleryUseCase.getPhotos(100000, 0);
      const totalInCache = await galleryUseCase.getTotalCount();

      if (cachedPhotos.length > 0) {
          setPhotos(cachedPhotos);
          setTotalCount(totalInCache);
      }

      // 2. Get cloud index
      const index = await galleryUseCase.getCloudIndex(creds, email);
      setCloudIndex(index);

      // 3. Trigger sync and wait for it if cache was empty
      // This ensures we don't show "No photos found" while the first sync is running
      if (cachedPhotos.length === 0) {
          await performSync();
      } else {
          performSync().catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  }, [galleryUseCase, creds, email, performSync]);

  const loadMore = useCallback(async () => {
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await performSync();
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

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { photos, totalCount, cloudIndex, loading, refreshing, error, refresh, loadMore, hasMore, addPhoto, deletePhotos };
};
