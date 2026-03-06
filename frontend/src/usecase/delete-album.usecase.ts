import type { IAlbumRepository } from '../domain/types';

export class DeleteAlbumUseCase {
  constructor(private albumRepo: IAlbumRepository) {}

  async execute(bucket: string, email: string, albumId: string): Promise<void> {
    await this.albumRepo.deleteAlbum(bucket, email, albumId);
  }
}
