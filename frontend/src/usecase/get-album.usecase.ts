import { IAlbumRepository, Album } from '../domain/types';

export class GetAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, albumId: string): Promise<Album> {
        try {
            return await this.albumRepo.getAlbum(bucket, email, albumId);
        } catch (e) {
            // If direct fetch fails (e.g. not owner), try finding it in shared albums
            const albums = await this.albumRepo.listAlbums(bucket, email);
            const found = albums.find(a => a.id === albumId);
            if (found) return found;
            throw e;
        }
    }
}
