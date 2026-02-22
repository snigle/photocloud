import { GalleryUseCase } from '../gallery.usecase';
import { IS3Repository, ILocalGalleryRepository, S3Credentials } from '../../domain/types';

describe('GalleryUseCase', () => {
  let galleryUseCase: GalleryUseCase;
  let mockS3Repo: jest.Mocked<IS3Repository>;
  let mockLocalRepo: jest.Mocked<ILocalGalleryRepository>;

  const mockCreds: S3Credentials = {
    access: 'access',
    secret: 'secret',
    endpoint: 'endpoint',
    region: 'region',
    bucket: 'bucket',
    user_key: 'user_key',
  };

  beforeEach(() => {
    mockS3Repo = {
      listPhotos: jest.fn(),
      uploadFile: jest.fn(),
      getFile: jest.fn(),
      getDownloadUrl: jest.fn(),
      exists: jest.fn(),
    };
    mockLocalRepo = {
      listLocalPhotos: jest.fn(),
      saveToCache: jest.fn(),
      loadFromCache: jest.fn(),
      existsById: jest.fn(),
    };
    galleryUseCase = new GalleryUseCase(mockS3Repo, mockLocalRepo);
  });

  it('should sync local and cloud photos and update cache', async () => {
    mockLocalRepo.listLocalPhotos.mockResolvedValue([
      { id: 'local1', creationDate: 100, type: 'local', uri: 'uri1', size: 0, width: 0, height: 0 } as any,
    ]);
    mockS3Repo.listPhotos.mockResolvedValue([
      { id: 'cloud1', creationDate: 200, type: 'cloud', key: 'key1', size: 0, width: 0, height: 0 } as any,
    ]);

    await galleryUseCase.sync(mockCreds, 'test@example.com');

    expect(mockS3Repo.listPhotos).toHaveBeenCalledWith(mockCreds.bucket, 'test@example.com');
    expect(mockLocalRepo.saveToCache).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'cloud1' }),
      expect.objectContaining({ id: 'local1' }),
    ]));
  });

  it('should get photos from cache with pagination', async () => {
    const cachedPhotos = [{ id: 'cached1', creationDate: 50 } as any];
    mockLocalRepo.loadFromCache.mockResolvedValue(cachedPhotos);

    const photos = await galleryUseCase.getPhotos(10, 0);

    expect(photos).toEqual(cachedPhotos);
    expect(mockLocalRepo.loadFromCache).toHaveBeenCalledWith(10, 0);
  });
});
