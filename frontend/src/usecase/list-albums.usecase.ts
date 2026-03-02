import { IAlbumRepository, Album } from '../domain/types';

export class ListAlbumsUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

  async execute(bucket: string, email: string, skipCache = false): Promise<Album[]> {
    return await this.albumRepo.listAlbums(bucket, email, skipCache);
    }
}
