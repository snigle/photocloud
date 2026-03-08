import { IAlbumRepository, Album } from '../domain/types';

export class ShareAlbumUseCase {
    constructor(private albumRepo: IAlbumRepository) {}

    async execute(bucket: string, email: string, albumId: string, shareEmail: string): Promise<Album> {
        return await this.albumRepo.shareAlbum(bucket, email, albumId, shareEmail);
    }
}
