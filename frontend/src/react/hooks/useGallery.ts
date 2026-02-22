import { useState, useEffect } from 'react';
import type { S3Credentials, Photo } from '../domain/types';
import { S3Service } from '../services/s3.service';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = async () => {
    if (!creds || !email) return;
    setLoading(true);
    setError(null);
    try {
      const s3Service = new S3Service(creds);
      const bucket = creds.bucket;
      const prefix = `users/${email}/`;
      const fetchedPhotos = await s3Service.listPhotos(bucket, prefix);
      setPhotos(fetchedPhotos);
    } catch (err: any) {
      console.error('Gallery error:', err);
      setError(err.message || 'Failed to fetch photos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [creds, email]);

  return { photos, loading, error, refresh: loadPhotos };
};
