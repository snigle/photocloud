import { useState, useCallback, useMemo, useEffect } from 'react';
import { AlbumRepository } from '../../infra/album.repository';
import { S3Repository } from '../../infra/s3.repository';
import { ListAlbumsUseCase } from '../../usecase/list-albums.usecase';
import { CreateAlbumUseCase } from '../../usecase/create-album.usecase';
import { AddPhotosToAlbumUseCase } from '../../usecase/add-photos-to-album.usecase';
import { Album, S3Credentials } from '../../domain/types';

export function useAlbums(creds: S3Credentials, email: string) {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const s3Repo = useMemo(() => new S3Repository(creds), [creds]);
    const albumRepo = useMemo(() => new AlbumRepository(s3Repo), [s3Repo]);

    const listAlbumsUseCase = useMemo(() => new ListAlbumsUseCase(albumRepo), [albumRepo]);
    const createAlbumUseCase = useMemo(() => new CreateAlbumUseCase(albumRepo), [albumRepo]);
    const addPhotosToAlbumUseCase = useMemo(() => new AddPhotosToAlbumUseCase(albumRepo), [albumRepo]);

    const loadAlbums = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await listAlbumsUseCase.execute(creds.bucket, email);
            setAlbums(result);
        } catch (err: any) {
            setError(err.message || 'Failed to load albums');
        } finally {
            setLoading(false);
        }
    }, [creds.bucket, email, listAlbumsUseCase]);

    const createAlbum = useCallback(async (title: string, photoKeys?: string[]) => {
        setLoading(true);
        try {
            const album = await createAlbumUseCase.execute(creds.bucket, email, title, photoKeys);
            setAlbums(prev => [...prev, album]);
            return album;
        } catch (err: any) {
            setError(err.message || 'Failed to create album');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [creds.bucket, email, createAlbumUseCase]);

    const addPhotosToAlbum = useCallback(async (albumId: string, photoKeys: string[]) => {
        setLoading(true);
        try {
            const updatedAlbum = await addPhotosToAlbumUseCase.execute(creds.bucket, email, albumId, photoKeys);
            setAlbums(prev => prev.map(a => a.id === albumId ? updatedAlbum : a));
            return updatedAlbum;
        } catch (err: any) {
            setError(err.message || 'Failed to add photos to album');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [creds.bucket, email, addPhotosToAlbumUseCase]);

    useEffect(() => {
        loadAlbums();
    }, [loadAlbums]);

    return {
        albums,
        loading,
        error,
        refresh: loadAlbums,
        createAlbum,
        addPhotosToAlbum,
    };
}
