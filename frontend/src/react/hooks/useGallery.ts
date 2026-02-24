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

  const PAGE_SIZE = 100;

  const galleryUseCase = useMemo(() => {
    if (!creds) return null;
    return new GalleryUseCase(new S3Repository(creds), new LocalGalleryRepository());
  }, [creds]);

  const photosRef = useRef<(Photo | null)[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const loadInitial = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;

    if (photosRef.current.length === 0) {
        setLoading(true);
    }

    try {
      // 1. Get quick counts
      const index = await galleryUseCase.getCloudIndex(creds, email);
      setCloudIndex(index);
      const cloudTotal = index.years.reduce((acc, y) => acc + y.count, 0);

      const localRepo = new LocalGalleryRepository();
      const localPhotos = await localRepo.listLocalPhotos();
      const uploadedLocalIds = await localRepo.getUploadedLocalIds();
      const filteredLocal = localPhotos.filter(p => !uploadedLocalIds.has(p.id));

      const total = cloudTotal + filteredLocal.length;
      setTotalCount(total);

      // 2. Load what we have in cache
      const cachedPhotos = await galleryUseCase.getPhotos(total, 0);

      // Initialize sparse array
      const sparsePhotos = new Array(total).fill(null);
      // Put cached photos at the beginning (they are sorted descending)
      for (let i = 0; i < cachedPhotos.length; i++) {
          sparsePhotos[i] = cachedPhotos[i];
      }
      // Also include non-uploaded local photos (they are newest)
      const allKnown = [...filteredLocal, ...cachedPhotos].sort((a, b) => b.creationDate - a.creationDate);
      for (let i = 0; i < allKnown.length; i++) {
          sparsePhotos[i] = allKnown[i];
      }

      setPhotos(sparsePhotos);
      setHasMore(allKnown.length < total);

      // 3. Trigger background sync
      galleryUseCase.sync(creds, email).then(async () => {
          const refreshed = await galleryUseCase.getPhotos(100000, 0); // Get all from cache
          const localAfter = await localRepo.listLocalPhotos();
          const uploadedAfter = await localRepo.getUploadedLocalIds();
          const filteredLocalAfter = localAfter.filter(p => !uploadedAfter.has(p.id));

          const allRefreshed = [...filteredLocalAfter, ...refreshed].sort((a, b) => b.creationDate - a.creationDate);

          setPhotos(prev => {
              const next = new Array(Math.max(prev.length, allRefreshed.length)).fill(null);
              for (let i = 0; i < allRefreshed.length; i++) {
                  next[i] = allRefreshed[i];
              }
              return next;
          });
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  }, [galleryUseCase, creds, email]);

  const loadMore = useCallback(async () => {
      // With the new sparse array approach, loadMore is less critical as we initialize the full size
      // but we might still want it for truly infinite scrolling if totalCount grows
  }, []);

  const refresh = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    setRefreshing(true);
    try {
      await galleryUseCase.sync(creds, email);
      await loadInitial();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh photos');
    } finally {
      setRefreshing(false);
    }
  }, [galleryUseCase, creds, email, loadInitial]);

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
