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
        };
        const useCase = new UploadUseCase(mockS3Repo as any);
        expect(useCase).toBeDefined();
    });
});
