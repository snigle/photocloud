import { useState, useEffect, useCallback } from 'react';
import type { S3Credentials, Photo } from '../../domain/types';
import { S3Repository } from '../../infra/s3.repository';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!creds || !email) return;
    setLoading(true);
    setError(null);
    try {
      const s3Repo = new S3Repository(creds);
      const bucket = creds.bucket;
      const prefix = `users/${email}/`;
      const fetchedPhotos = await s3Repo.listPhotos(bucket, prefix);
      setPhotos(fetchedPhotos);
    } catch (err: any) {
      console.error('Gallery error:', err);
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  }, [creds, email]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  return { photos, loading, error, refresh: loadPhotos };
};
