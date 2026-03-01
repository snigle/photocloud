import { IAlbumRepository, Album } from '../domain/types';
import { v4 as uuidv4 } from 'uuid';

export class CreateAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, title: string, photoKeys: string[] = []): Promise<Album> {
        const now = Math.floor(Date.now() / 1000);
        const album: Album = {
            id: uuidv4(),
            title,
            photoKeys,
            coverPhotoKey: photoKeys.length > 0 ? photoKeys[0] : undefined,
            order: 'date-desc',
            createdAt: now,
            updatedAt: now,
        };

        await this.albumRepo.saveAlbum(bucket, email, album);
        return album;
    }
}
