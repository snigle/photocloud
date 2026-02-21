import { useState, useEffect } from 'react';
import type { S3Credentials, Photo } from '../domain/types';
import { S3Service } from '../services/s3.service';

export const useGallery = (creds: S3Credentials | null, email: string | null) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (creds && email) {
      const loadPhotos = async () => {
        setLoading(true);
        try {
          const s3Service = new S3Service(creds);
          const bucket = creds.bucket;
          const prefix = `users/${email}/`;
          const fetchedPhotos = await s3Service.listPhotos(bucket, prefix);
          setPhotos(fetchedPhotos);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      loadPhotos();
    }
  }, [creds, email]);

  return { photos, loading, error };
};
