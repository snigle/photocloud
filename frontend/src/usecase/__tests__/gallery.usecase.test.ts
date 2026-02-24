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
      getCloudIndex: jest.fn(),
      uploadFile: jest.fn(),
      getFile: jest.fn(),
      getDownloadUrl: jest.fn(),
      exists: jest.fn(),
      deleteFile: jest.fn(),
    };
    mockLocalRepo = {
      listLocalPhotos: jest.fn(),
      saveToCache: jest.fn(),
      savePhoto: jest.fn(),
      loadFromCache: jest.fn(),
      existsById: jest.fn(),
      countPhotos: jest.fn(),
      markAsUploaded: jest.fn(),
      getUploadedLocalIds: jest.fn().mockResolvedValue(new Set()),
      deleteFromCache: jest.fn(),
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

  it('should delete cloud photo from S3 and cache', async () => {
    const photo = { id: 'p1', type: 'cloud', key: 'users/test/2024/thumbnail/p1.enc' } as any;

    await galleryUseCase.deletePhoto(mockCreds, photo);

    expect(mockS3Repo.deleteFile).toHaveBeenCalledTimes(3);
    expect(mockS3Repo.deleteFile).toHaveBeenCalledWith(mockCreds.bucket, 'users/test/2024/thumbnail/p1.enc');
    expect(mockS3Repo.deleteFile).toHaveBeenCalledWith(mockCreds.bucket, 'users/test/2024/1080p/p1.enc');
    expect(mockS3Repo.deleteFile).toHaveBeenCalledWith(mockCreds.bucket, 'users/test/2024/original/p1.enc');
    expect(mockLocalRepo.deleteFromCache).toHaveBeenCalledWith('p1');
  });

  it('should delete local photo from cache only', async () => {
    const photo = { id: 'p2', type: 'local', uri: 'file://p2' } as any;

    await galleryUseCase.deletePhoto(mockCreds, photo);

    expect(mockS3Repo.deleteFile).not.toHaveBeenCalled();
    expect(mockLocalRepo.deleteFromCache).toHaveBeenCalledWith('p2');
  });
});
