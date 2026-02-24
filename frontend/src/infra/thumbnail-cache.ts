export interface CacheEntry {
    data: Uint8Array;
    displayUrl?: string;
}

export class ThumbnailCache {
    private static cache = new Map<string, CacheEntry>();
    private static keys: string[] = [];
    private static MAX_SIZE = 1000;

    static get(id: string): CacheEntry | undefined {
        return this.cache.get(id);
    }

    static set(id: string, entry: CacheEntry) {
        if (this.cache.has(id)) {
            const existing = this.cache.get(id)!;
            if (entry.displayUrl && !existing.displayUrl) {
                existing.displayUrl = entry.displayUrl;
            }
            return;
        }

        if (this.keys.length >= this.MAX_SIZE) {
            const oldest = this.keys.shift();
            if (oldest) {
                const evicted = this.cache.get(oldest);
                if (evicted?.displayUrl && evicted.displayUrl.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                    URL.revokeObjectURL(evicted.displayUrl);
                }
                this.cache.delete(oldest);
            }
        }

        this.cache.set(id, entry);
        this.keys.push(id);
    }

    static clear() {
        for (const entry of this.cache.values()) {
            if (entry.displayUrl && entry.displayUrl.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                URL.revokeObjectURL(entry.displayUrl);
            }
        }
        this.cache.clear();
        this.keys = [];
    }
}
