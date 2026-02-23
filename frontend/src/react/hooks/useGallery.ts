import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { S3Credentials, Photo } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { GalleryUseCase } from '../../usecase/gallery.usecase';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
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

  const photosRef = useRef<Photo[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const loadInitial = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;

    // If we already have photos, don't show the full loading state to avoid flicker/disappearance
    if (photosRef.current.length === 0) {
        setLoading(true);
    }

    try {
      const count = await galleryUseCase.getTotalCount();
      setTotalCount(count);

      const initialPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, 0);

      setPhotos(prev => {
          if (prev.length === 0) return initialPhotos;

          // Merge to avoid losing items during re-loads
          const merged = [...initialPhotos];
          const initialIds = new Set(initialPhotos.map(p => p.id));
          for (const p of prev) {
              if (!initialIds.has(p.id)) {
                  merged.push(p);
              }
          }
          return merged.sort((a, b) => b.creationDate - a.creationDate);
      });

      setHasMore(initialPhotos.length < count);

      // Trigger background sync
      galleryUseCase.sync(creds, email).then(async () => {
          // Refresh list from cache after sync
          const newCount = await galleryUseCase.getTotalCount();
          setTotalCount(newCount);
          const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);

          setPhotos(prev => {
              // Merge existing state with refreshed state to avoid losing newly uploaded photos
              // that might not have been caught by sync yet.
              const merged = [...refreshed];
              const refreshedIds = new Set(refreshed.map(p => p.id));
              for (const p of prev) {
                  if (!refreshedIds.has(p.id)) {
                      merged.push(p);
                  }
              }
              return merged.sort((a, b) => b.creationDate - a.creationDate);
          });
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

    try {
      const nextPhotos = await galleryUseCase.getPhotos(PAGE_SIZE, photos.length);
      setPhotos(prev => [...prev, ...nextPhotos]);
      if (nextPhotos.length < PAGE_SIZE || photos.length + nextPhotos.length >= totalCount) {
          setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more photos', err);
    }
  }, [galleryUseCase, loading, hasMore, photos.length, totalCount]);

  const refresh = useCallback(async () => {
    if (!galleryUseCase || !creds || !email) return;
    setRefreshing(true);
    try {
      await galleryUseCase.sync(creds, email);
      const newCount = await galleryUseCase.getTotalCount();
      setTotalCount(newCount);
      const refreshed = await galleryUseCase.getPhotos(PAGE_SIZE, 0);
      setPhotos(refreshed);
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
        if (prev.find(p => p.id === photo.id)) return prev;

        // Fast path: if it's newer than the first photo, just prepend
        if (prev.length === 0 || photo.creationDate >= prev[0].creationDate) {
            return [photo, ...prev];
        }

        // Slow path: insert and sort
        const newPhotos = [photo, ...prev];
        return newPhotos.sort((a, b) => b.creationDate - a.creationDate);
    });
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { photos, totalCount, loading, refreshing, error, refresh, loadMore, hasMore, addPhoto };
};
