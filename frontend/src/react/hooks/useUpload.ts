import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { S3Repository } from '../../infra/s3.repository';
import { UploadUseCase } from '../../usecase/upload.usecase';
import type { S3Credentials } from '../../domain/types';

export const useUpload = (creds: S3Credentials | null, email: string | null) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async () => {
    if (!creds || !email) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setUploading(true);
      setError(null);

      const asset = result.assets[0];
      const s3Repo = new S3Repository(creds);
      const uploadUseCase = new UploadUseCase(s3Repo);

      await uploadUseCase.execute(asset.uri, asset.name, creds, email);

      return true; // Success
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload photo');
      return false;
    } finally {
      setUploading(false);
    }
  }, [creds, email]);

  return { upload, uploading, error };
};
