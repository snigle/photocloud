import { IAlbumRepository, Album } from '../domain/types';

export class AddPhotosToAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, albumId: string, photoKeys: string[]): Promise<Album> {
        const album = await this.albumRepo.getAlbum(bucket, email, albumId);

        // Add only new keys
        const existingKeys = new Set(album.photoKeys);
        const newKeys = photoKeys.filter(key => !existingKeys.has(key));

        if (newKeys.length === 0) return album;

        album.photoKeys = [...album.photoKeys, ...newKeys];

        if (!album.coverPhotoKey && album.photoKeys.length > 0) {
            album.coverPhotoKey = album.photoKeys[0];
        }

        album.updatedAt = Math.floor(Date.now() / 1000);
        await this.albumRepo.saveAlbum(bucket, email, album);
        return album;
    }
}
