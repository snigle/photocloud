import { useState, useEffect, useCallback, useMemo } from 'react';
import type { S3Credentials, Photo } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { GalleryUseCase } from '../../usecase/gallery.usecase';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
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
      const initialPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, 0);
      setPhotos(initialPhotos);
      setHasMore(initialPhotos.length === PAGE_SIZE);

      // Trigger background sync
      galleryUseCase.sync(creds, email).then(async () => {
          // Refresh list from cache after sync
          const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);
          setPhotos(refreshed);
          setHasMore(refreshed.length === PAGE_SIZE);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  }, [galleryUseCase, creds, email]);

  const loadMore = useCallback(async () => {
    if (!galleryUseCase || loading || !hasMore) return;
    try {
      const nextPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, photos.length);
      if (nextPhotos.length < PAGE_SIZE) {
          setHasMore(false);
      }
      setPhotos(prev => [...prev, ...nextPhotos]);
    } catch (err) {
      console.error('Failed to load more photos', err);
    }
  }, [galleryUseCase, loading, hasMore, photos.length]);

  const refresh = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    setRefreshing(true);
    try {
      await galleryUseCase.sync(creds, email);
      const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);
      setPhotos(refreshed);
      setHasMore(refreshed.length === PAGE_SIZE);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh photos');
    } finally {
      setRefreshing(false);
    }
  }, [galleryUseCase, creds, email]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { photos, loading, refreshing, error, refresh, loadMore, hasMore };
};
