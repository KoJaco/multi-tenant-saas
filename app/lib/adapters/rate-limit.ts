/**
 * Rate Limiting Adapter Interface and Implementations
 *
 * Provides a flexible adapter pattern for rate limiting.
 * Supports in-memory (development) and Redis (production) implementations.
 */

import type {
    RateLimitOptions,
    RateLimitResult,
} from "./types";

/**
 * Rate limiting adapter interface
 */
export interface RateLimitAdapter {
    /**
     * Check if a request should be rate limited
     * @param key Unique identifier for the rate limit (e.g., IP address)
     * @param options Rate limiting options
     * @returns Rate limit result
     */
    checkLimit(
        key: string,
        options: RateLimitOptions
    ): Promise<RateLimitResult>;

    /**
     * Reset rate limit for a key
     * @param key Unique identifier
     */
    resetLimit(key: string): Promise<void>;

    /**
     * Cleanup expired entries (for in-memory implementations)
     */
    cleanup?(): Promise<void>;
}

/**
 * In-memory rate limiting adapter
 * Suitable for development and single-server deployments
 */
export class InMemoryRateLimitAdapter implements RateLimitAdapter {
    private store = new Map<string, { count: number; resetAt: number }>();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Cleanup expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    async checkLimit(
        key: string,
        options: RateLimitOptions
    ): Promise<RateLimitResult> {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now > entry.resetAt) {
            // New window or expired window
            const resetAt = now + options.windowMs;
            this.store.set(key, { count: 1, resetAt });
            return {
                allowed: true,
                remaining: options.maxRequests - 1,
                resetAt,
            };
        }

        // Increment count
        entry.count++;
        this.store.set(key, entry);

        if (entry.count > options.maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetAt,
                retryAfter,
            };
        }

        return {
            allowed: true,
            remaining: options.maxRequests - entry.count,
            resetAt: entry.resetAt,
        };
    }

    async resetLimit(key: string): Promise<void> {
        this.store.delete(key);
    }

    async cleanup(): Promise<void> {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.resetAt < now) {
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
 * Redis rate limiting adapter
 * Suitable for production and multi-server deployments
 */
export class RedisRateLimitAdapter implements RateLimitAdapter {
    private redis: any; // Redis client (ioredis or similar)

    constructor(redisClient: any) {
        this.redis = redisClient;
    }

    async checkLimit(
        key: string,
        options: RateLimitOptions
    ): Promise<RateLimitResult> {
        const now = Date.now();
        const windowStart = now - options.windowMs;
        const redisKey = `rate_limit:${key}`;

        // Use Redis sorted set to track requests
        // Score is timestamp, member is request ID
        const pipeline = this.redis.pipeline();

        // Remove old entries outside the window
        pipeline.zremrangebyscore(redisKey, 0, windowStart);

        // Count current entries
        pipeline.zcard(redisKey);

        // Add current request
        pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);

        // Set expiration
        pipeline.expire(redisKey, Math.ceil(options.windowMs / 1000));

        const results = await pipeline.exec();
        const count = results[1][1] as number; // Result from zcard

        const resetAt = now + options.windowMs;
        const newCount = count + 1;

        if (newCount > options.maxRequests) {
            const retryAfter = Math.ceil((resetAt - now) / 1000);
            return {
                allowed: false,
                remaining: 0,
                resetAt,
                retryAfter,
            };
        }

        return {
            allowed: true,
            remaining: options.maxRequests - newCount,
            resetAt,
        };
    }

    async resetLimit(key: string): Promise<void> {
        await this.redis.del(`rate_limit:${key}`);
    }
}

/**
 * Get the default rate limit adapter based on environment
 */
export function getDefaultRateLimitAdapter(): RateLimitAdapter {
    // Check if Redis is configured
    if (process.env.REDIS_URL) {
        try {
            // Dynamically import ioredis to avoid requiring it if not used
            const Redis = require("ioredis");
            const redis = new Redis(process.env.REDIS_URL);
            return new RedisRateLimitAdapter(redis);
        } catch (error) {
            console.warn(
                "Redis URL configured but ioredis not installed. Falling back to in-memory adapter."
            );
            console.warn("Install ioredis: npm install ioredis");
        }
    }

    // Default to in-memory adapter
    return new InMemoryRateLimitAdapter();
}

/**
 * Global rate limit adapter instance
 * Set via setRateLimitAdapter() or use default
 */
let rateLimitAdapter: RateLimitAdapter | null = null;

/**
 * Set the rate limit adapter to use
 */
export function setRateLimitAdapter(adapter: RateLimitAdapter): void {
    rateLimitAdapter = adapter;
}

/**
 * Get the current rate limit adapter
 */
export function getRateLimitAdapter(): RateLimitAdapter {
    if (!rateLimitAdapter) {
        rateLimitAdapter = getDefaultRateLimitAdapter();
    }
    return rateLimitAdapter;
}

