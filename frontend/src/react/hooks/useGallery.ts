import { useState, useEffect, useCallback, useMemo } from 'react';
import type { S3Credentials, Photo } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { GalleryUseCase } from '../../usecase/gallery.usecase';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<(Photo | null)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 60; // Multiple of 3 for the grid

  const galleryUseCase = useMemo(() => {
    if (!creds) return null;
    return new GalleryUseCase(new S3Repository(creds), new LocalGalleryRepository());
  }, [creds]);

  const loadInitial = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    setLoading(true);
    try {
      const count = await galleryUseCase.getTotalCount();
      setTotalCount(count);

      const initialPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, 0);

      const newPhotos = new Array(count).fill(null);
      for (let i = 0; i < initialPhotos.length; i++) {
        newPhotos[i] = initialPhotos[i];
      }
      setPhotos(newPhotos);
      setHasMore(initialPhotos.length < count);

      // Trigger background sync
      galleryUseCase.sync(creds, email).then(async () => {
          // Refresh list from cache after sync
          const newCount = await galleryUseCase.getTotalCount();
          setTotalCount(newCount);
          const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);

          const updatedPhotos = new Array(newCount).fill(null);
          for (let i = 0; i < refreshed.length; i++) {
              updatedPhotos[i] = refreshed[i];
          }
          setPhotos(updatedPhotos);
          setHasMore(refreshed.length < newCount);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  }, [galleryUseCase, creds, email]);

  const loadMore = useCallback(async () => {
    if (!galleryUseCase || loading || !hasMore) return;

    // Find first null index
    const offset = photos.findIndex(p => p === null);
    if (offset === -1) {
        setHasMore(false);
        return;
    }

    try {
      const nextPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, offset);
      setPhotos(prev => {
          const next = [...prev];
          for (let i = 0; i < nextPhotos.length; i++) {
              next[offset + i] = nextPhotos[i];
          }
          return next;
      });
      if (nextPhotos.length < PAGE_SIZE || offset + nextPhotos.length >= totalCount) {
          setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more photos', err);
    }
  }, [galleryUseCase, loading, hasMore, photos, totalCount]);

  const refresh = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    setRefreshing(true);
    try {
      await galleryUseCase.sync(creds, email);
      const newCount = await galleryUseCase.getTotalCount();
      setTotalCount(newCount);
      const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);

      const updatedPhotos = new Array(newCount).fill(null);
      for (let i = 0; i < refreshed.length; i++) {
          updatedPhotos[i] = refreshed[i];
      }
      setPhotos(updatedPhotos);
      setHasMore(refreshed.length < newCount);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh photos');
    } finally {
      setRefreshing(false);
    }
  }, [galleryUseCase, creds, email]);

  const addPhoto = useCallback((photo: Photo) => {
    setTotalCount(prev => prev + 1);
    setPhotos(prev => {
        if (prev.find(p => p && p.id === photo.id)) return prev;
        const newPhotos = [photo, ...prev];
        return newPhotos.sort((a, b) => {
            const dateA = a?.creationDate || 0;
            const dateB = b?.creationDate || 0;
            return dateB - dateA;
        });
    });
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { photos, totalCount, loading, refreshing, error, refresh, loadMore, hasMore, addPhoto };
};
