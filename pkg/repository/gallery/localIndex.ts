import { IGalleryRepository, GalleryPhoto } from "../../domain/eGallery";
import { ICacheConnector } from "../connectors/cache";

const CHUNK_SIZE = 1000;
const INDEX_KEY = "gallery_index_count";
const CHUNK_PREFIX = "gallery_index_chunk_";

/**
 * LocalGalleryRepository implements a local index for the gallery.
 * For 50k+ photos, it uses a chunked storage strategy in the cache to avoid
 * single-key size limits and reduce main-thread blocking during serialization.
 * Note: On mobile/web, this should ideally be replaced by IndexedDB or SQLite.
 */
export class LocalGalleryRepository implements IGalleryRepository {
    private photos: GalleryPhoto[] = [];
    private cache: Storage;

    constructor(cacheConnector: ICacheConnector) {
        this.cache = cacheConnector.Connect();
        this.load();
    }

    private load() {
        const countStr = this.cache.getItem(INDEX_KEY);
        if (!countStr) return;

        try {
            const chunkCount = parseInt(countStr);
            const allPhotos: GalleryPhoto[] = [];

            for (let i = 0; i < chunkCount; i++) {
                const data = this.cache.getItem(`${CHUNK_PREFIX}${i}`);
                if (data) {
                    const parsed = JSON.parse(data);
                    allPhotos.push(...parsed.map((p: any) => ({
                        ...p,
                        date: new Date(p.date),
                        localPhoto: p.localPhoto ? {
                            ...p.localPhoto,
                            creationDate: new Date(p.localPhoto.creationDate)
                        } : undefined,
                        cloudPhoto: p.cloudPhoto ? {
                            ...p.cloudPhoto,
                            creationDate: new Date(p.cloudPhoto.creationDate)
                        } : undefined
                    })));
                }
            }
            this.photos = allPhotos;
        } catch (e) {
            console.error("Failed to load gallery index chunks", e);
            this.photos = [];
        }
    }

    private save() {
        try {
            const oldCountStr = this.cache.getItem(INDEX_KEY);
            const oldCount = oldCountStr ? parseInt(oldCountStr) : 0;

            const chunkCount = Math.ceil(this.photos.length / CHUNK_SIZE);

            for (let i = 0; i < chunkCount; i++) {
                const chunk = this.photos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                this.cache.setItem(`${CHUNK_PREFIX}${i}`, JSON.stringify(chunk));
            }

            // Remove old chunks that are no longer needed
            for (let i = chunkCount; i < oldCount; i++) {
                this.cache.removeItem(`${CHUNK_PREFIX}${i}`);
            }

            this.cache.setItem(INDEX_KEY, chunkCount.toString());
        } catch (e) {
            console.error("Failed to save gallery index to cache (quota exceeded?)", e);
            // Fallback: keep in memory but persistent save failed
        }
    }

    async savePhotos(photos: GalleryPhoto[]): Promise<void> {
        this.photos = photos;
        this.save();
    }

    async getPhotos(offset: number, limit: number): Promise<GalleryPhoto[]> {
        return this.photos.slice(offset, offset + limit);
    }

    async getCount(): Promise<number> {
        return this.photos.length;
    }

    async clear(): Promise<void> {
        try {
            const countStr = this.cache.getItem(INDEX_KEY);
            if (countStr) {
                const chunkCount = parseInt(countStr);
                for (let i = 0; i < chunkCount; i++) {
                    this.cache.removeItem(`${CHUNK_PREFIX}${i}`);
                }
            }
            this.cache.removeItem(INDEX_KEY);
        } catch (e) {
            console.error("Failed to clear gallery cache", e);
        }
        this.photos = [];
    }
}
