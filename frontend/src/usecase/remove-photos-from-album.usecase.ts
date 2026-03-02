import { IAlbumRepository, Album } from '../domain/types';

export class RemovePhotosFromAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, albumId: string, photoKeys: string[]): Promise<Album> {
        const album = await this.albumRepo.getAlbum(bucket, email, albumId);

        const keysToRemove = new Set(photoKeys);
        const originalKeys = album.photoKeys;

        album.photoKeys = originalKeys.filter(key => !keysToRemove.has(key));

        if (album.photoKeys.length === originalKeys.length) {
            return album; // Nothing removed
        }

        // Update cover photo if it was removed
        if (album.coverPhotoKey && keysToRemove.has(album.coverPhotoKey)) {
            album.coverPhotoKey = album.photoKeys.length > 0 ? album.photoKeys[0] : undefined;
        }

        album.updatedAt = Math.floor(Date.now() / 1000);
        await this.albumRepo.saveAlbum(bucket, email, album);
        return album;
    }
}
