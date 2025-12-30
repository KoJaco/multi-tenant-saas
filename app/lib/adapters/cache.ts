/**
 * Cache Adapter Interface and Implementations
 *
 * Provides a flexible adapter pattern for caching.
 * Supports in-memory (development) and Redis (production) implementations.
 */

import type { CacheOptions } from "./types";

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
    /**
     * Get a value from cache
     * @param key Cache key
     * @returns Cached value or null if not found
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Set a value in cache
     * @param key Cache key
     * @param value Value to cache
     * @param options Cache options (TTL, etc.)
     */
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

    /**
     * Delete a value from cache
     * @param key Cache key
     */
    delete(key: string): Promise<void>;

    /**
     * Clear all cache entries (optional, may not be supported)
     */
    clear?(): Promise<void>;

    /**
     * Check if a key exists in cache
     * @param key Cache key
     */
    has(key: string): Promise<boolean>;
}

/**
 * In-memory cache adapter
 * Suitable for development and single-server deployments
 */
export class InMemoryCacheAdapter implements CacheAdapter {
    private store = new Map<
        string,
        { value: any; expiresAt: number | null }
    >();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Cleanup expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    async get<T>(key: string): Promise<T | null> {
        const entry = this.store.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return entry.value as T;
    }

    async set<T>(
        key: string,
        value: T,
        options?: CacheOptions
    ): Promise<void> {
        const ttl = options?.ttl || 3600; // Default 1 hour
        const expiresAt = Date.now() + ttl * 1000;

        this.store.set(key, {
            value,
            expiresAt,
        });
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async has(key: string): Promise<boolean> {
        const entry = this.store.get(key);
        if (!entry) {
            return false;
        }

        // Check if expired
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return false;
        }

        return true;
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt && entry.expiresAt < now) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Stop cleanup interval (call when shutting down)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

/**
 * Redis cache adapter
 * Suitable for production and multi-server deployments
 */
export class RedisCacheAdapter implements CacheAdapter {
    private redis: any; // Redis client (ioredis or similar)
    private keyPrefix: string;

    constructor(redisClient: any, keyPrefix: string = "cache:") {
        this.redis = redisClient;
        this.keyPrefix = keyPrefix;
    }

    private getKey(key: string): string {
        return `${this.keyPrefix}${key}`;
    }

    async get<T>(key: string): Promise<T | null> {
        const redisKey = this.getKey(key);
        const value = await this.redis.get(redisKey);

        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value) as T;
        } catch {
            // If not JSON, return as string
            return value as T;
        }
    }

    async set<T>(
        key: string,
        value: T,
        options?: CacheOptions
    ): Promise<void> {
        const redisKey = this.getKey(key);
        const ttl = options?.ttl || 3600; // Default 1 hour

        const serialized =
            typeof value === "string" ? value : JSON.stringify(value);

        await this.redis.setex(redisKey, ttl, serialized);
    }

    async delete(key: string): Promise<void> {
        const redisKey = this.getKey(key);
        await this.redis.del(redisKey);
    }

    async clear(): Promise<void> {
        // Clear all keys with prefix
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    async has(key: string): Promise<boolean> {
        const redisKey = this.getKey(key);
        const result = await this.redis.exists(redisKey);
        return result === 1;
    }
}

/**
 * Get the default cache adapter based on environment
 */
export function getDefaultCacheAdapter(): CacheAdapter {
    // Check if Redis is configured
    if (process.env.REDIS_URL) {
        try {
            // Dynamically import ioredis to avoid requiring it if not used
            const Redis = require("ioredis");
            const redis = new Redis(process.env.REDIS_URL);
            return new RedisCacheAdapter(redis);
        } catch (error) {
            console.warn(
                "Redis URL configured but ioredis not installed. Falling back to in-memory cache."
            );
            console.warn("Install ioredis: npm install ioredis");
        }
    }

    // Default to in-memory adapter
    return new InMemoryCacheAdapter();
}

/**
 * Global cache adapter instance
 * Set via setCacheAdapter() or use default
 */
let cacheAdapter: CacheAdapter | null = null;

/**
 * Set the cache adapter to use
 */
export function setCacheAdapter(adapter: CacheAdapter): void {
    cacheAdapter = adapter;
}

/**
 * Get the current cache adapter
 */
export function getCacheAdapter(): CacheAdapter {
    if (!cacheAdapter) {
        cacheAdapter = getDefaultCacheAdapter();
    }
    return cacheAdapter;
}

