jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' }
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
  getRandomBytes: jest.fn(() => new Uint8Array(12)),
}));

import { UploadUseCase } from '../upload.usecase';

describe('UploadUseCase', () => {
    it('should be definable', () => {
        const mockS3Repo = {
            listPhotos: jest.fn(),
            uploadFile: jest.fn(),
            getFile: jest.fn(),
            exists: jest.fn(),
        };
        const mockLocalRepo = {
            existsById: jest.fn(),
            listLocalPhotos: jest.fn(),
            saveToCache: jest.fn(),
            loadFromCache: jest.fn(),
        };
        const useCase = new UploadUseCase(mockS3Repo as any, mockLocalRepo as any);
        expect(useCase).toBeDefined();
    });
});
