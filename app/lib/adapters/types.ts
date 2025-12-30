/**
 * Adapter Types
 *
 * Shared types for adapter interfaces
 */

export interface RateLimitOptions {
    maxRequests: number;
    identifier?: string;
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}
