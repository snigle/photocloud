import { IAlbumRepository, Album } from '../domain/types';

export class ListAlbumsUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string): Promise<Album[]> {
        return this.albumRepo.listAlbums(bucket, email);
    }
}
