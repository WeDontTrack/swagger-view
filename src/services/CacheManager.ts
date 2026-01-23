import { ICache, CacheConfig, CacheStats } from '../interfaces';

interface CacheItem<V> {
    value: V;
    timestamp: number;
}

export class CacheManager<K extends string, V> implements ICache<K, V> {
    private readonly cache: Map<K, CacheItem<V>> = new Map();
    private readonly config: CacheConfig;
    private hits: number = 0;
    private misses: number = 0;

    constructor(config: CacheConfig) {
        this.config = config;
    }


    public get(key: K): V | undefined {
        const item = this.cache.get(key);
        
        if (!item) {
            this.misses++;
            return undefined;
        }

        if (this.isExpired(item)) {
            this.cache.delete(key);
            this.misses++;
            return undefined;
        }

        item.timestamp = Date.now();
        this.hits++;
        return item.value;
    }

    public set(key: K, value: V): void {
        if (this.cache.size >= this.config.maxEntries) this.cleanup();

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    public has(key: K): boolean {
        const item = this.cache.get(key);
        if (!item) return false;

        if (this.isExpired(item)) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    public delete(key: K): boolean {
        return this.cache.delete(key);
    }

    public clear(): void {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    public size(): number {
        return this.cache.size;
    }

    public getStats(): CacheStats {
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            entries: Array.from(this.cache.keys())
        };
    }

    private isExpired(item: CacheItem<V>): boolean {
        return Date.now() - item.timestamp > this.config.maxAgeMs;
    }

    private cleanup(): void {
        const now = Date.now();
        const maxAge = this.config.maxAgeMs;

        this.cache.forEach((item, key) => (now - item.timestamp > maxAge) && this.cache.delete(key))

        // LRU eviction only if still over capacity
        const excess = this.cache.size - this.config.maxEntries;
        if (excess <= 0) return;

        // Find oldest entries to remove
        const removeCount = Math.ceil(excess + this.config.maxEntries * 0.25);
        const entries = Array.from(this.cache.entries());
        
        // Partial sort: only find the N oldest (O(n) vs O(n log n) for full sort)
        entries
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(0, removeCount)
            .forEach(([key]) => this.cache.delete(key));
    }
}

let analysisCacheInstance: CacheManager<string, any> | null = null;

export function getAnalysisCache(config?: CacheConfig): CacheManager<string, any> {
    if (!analysisCacheInstance) {
        analysisCacheInstance = new CacheManager(config || {
            maxAgeMs: 5 * 60 * 1000, // 5 minutes
            maxEntries: 10
        });
    }
    return analysisCacheInstance;
}

export function resetAnalysisCache(): void {
    if (analysisCacheInstance) {
        analysisCacheInstance.clear();
    }
    analysisCacheInstance = null;
}

