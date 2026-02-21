import React from 'react';
import type { S3Credentials } from '../domain/types';
import { useGallery } from '../hooks/useGallery';

interface Props {
  creds: S3Credentials;
  email: string;
  onLogout: () => void;
}

const GalleryScreen: React.FC<Props> = ({ creds, email, onLogout }) => {
  const { photos, loading, error } = useGallery(creds, email);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1>My Gallery</h1>
          <p>Logged in as: <strong>{email}</strong></p>
        </div>
        <button onClick={onLogout} style={{ padding: '5px 15px' }}>Logout</button>
      </header>

      {loading && <p>Loading photos...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!loading && !error && photos.length === 0 && (
        <p>No photos found in your prefix <code>users/{email}/</code></p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
        {photos.map(photo => (
          <div key={photo.key} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
            <img src={photo.url} alt={photo.key} style={{ width: '100%', height: '150px', objectFit: 'cover' }} />
            <div style={{ padding: '10px', fontSize: '12px', wordBreak: 'break-all' }}>
              {photo.key}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GalleryScreen;
