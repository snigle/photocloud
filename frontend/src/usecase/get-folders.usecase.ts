import { ILocalGalleryRepository, Folder } from '../domain/types';

export class GetFoldersUseCase {
  constructor(private localRepo: ILocalGalleryRepository) {}

  async execute(): Promise<Folder[]> {
    return this.localRepo.listFolders();
  }
}
