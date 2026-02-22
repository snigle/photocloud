import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { S3Repository } from '../../infra/s3.repository';
import { LocalGalleryRepository } from '../../infra/local-gallery.repository';
import { UploadUseCase } from '../../usecase/upload.usecase';
import type { S3Credentials, Photo } from '../../domain/types';

export const useUpload = (creds: S3Credentials | null, email: string | null) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number, total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (onUploadSuccess?: (photo: Photo) => void) => {
    if (!creds || !email) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) return;

      setUploading(true);
      setError(null);
      setProgress({ current: 0, total: result.assets.length });

      const s3Repo = new S3Repository(creds);
      const localRepo = new LocalGalleryRepository();
      const uploadUseCase = new UploadUseCase(s3Repo, localRepo);

      const CONCURRENCY = 1;
      const assets = [...result.assets];
      let current = 0;
      const total = assets.length;

      const worker = async () => {
        while (assets.length > 0) {
          const asset = assets.shift();
          if (!asset) break;

          try {
            const uploaded = await uploadUseCase.execute(asset.uri, asset.name, creds, email);
            if (uploaded && onUploadSuccess) {
                onUploadSuccess(uploaded);
            }
            // Give the UI thread some time to breathe between heavy image manipulations
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.error(`Failed to upload ${asset.name}`, e);
            // Continue with other assets
          } finally {
            current++;
            setProgress({ current, total });
          }
        }
      };

      const workers = Array(Math.min(CONCURRENCY, total))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      return true; // Success
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload photo');
      return false;
    } finally {
      setUploading(false);
    }
  }, [creds, email]);

  return { upload, uploading, progress, error };
};
