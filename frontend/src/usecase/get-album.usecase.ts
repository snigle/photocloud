import { IAlbumRepository, Album } from '../domain/types';

export class GetAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, albumId: string): Promise<Album> {
        return this.albumRepo.getAlbum(bucket, email, albumId);
    }
}
