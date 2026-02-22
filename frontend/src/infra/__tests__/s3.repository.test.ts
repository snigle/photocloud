import { S3Repository } from '../s3.repository';
import * as Crypto from 'expo-crypto';

jest.mock('expo-crypto', () => ({
  digest: jest.fn(),
  CryptoDigestAlgorithm: { MD5: 'MD5' }
}));

describe('S3Repository', () => {
    let repo: S3Repository;
    const mockCreds = {
        access: 'access',
        secret: 'secret',
        endpoint: 'https://s3.example.com',
        region: 'us-east-1',
        bucket: 'test-bucket',
        user_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // valid base64 for 32 bytes
    };

    beforeEach(() => {
        repo = new S3Repository(mockCreds);
        (Crypto.digest as jest.Mock).mockResolvedValue(new Uint8Array(16).buffer); // MD5 is 16 bytes
    });

    it('should be definable', () => {
        expect(repo).toBeDefined();
    });

    // Test for listPhotos logic
    it('should list photos and handle index.json correctly', async () => {
        // Mock s3.send
        const mockSend = jest.fn();
        (repo as any).s3.send = mockSend;

        // Mock getFile for index.json
        mockSend.mockImplementation(async (command) => {
            if (command.constructor.name === 'GetObjectCommand') {
                return {
                    Body: {
                        transformToUint8Array: () => Promise.resolve(new TextEncoder().encode(JSON.stringify({ years: [2024] })))
                    }
                };
            }
            if (command.constructor.name === 'ListObjectsV2Command') {
                return {
                    Contents: [
                        { Key: 'users/test@example.com/2024/original/1.enc', Size: 100, LastModified: new Date() }
                    ]
                };
            }
            return {};
        });

        const photos = await repo.listPhotos('test-bucket', 'test@example.com');
        expect(photos.length).toBeGreaterThan(0);
        expect(photos[0].id).toBe('1');
    });
});
