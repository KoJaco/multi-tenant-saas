/**
 * Rate Limiting Utility
 *
 * Provides rate limiting for authentication and sensitive endpoints
 * Uses adapter pattern for flexible implementations (in-memory or Redis)
 */

import { getRateLimitAdapter } from "./adapters/rate-limit";
import type { RateLimitOptions, RateLimitResult } from "./adapters/types";

// Re-export types for backward compatibility
export type { RateLimitOptions, RateLimitResult };

/**
 * Check if a request should be rate limited
 * @param request The incoming request
 * @param options Rate limiting options
 * @returns Rate limit result
 */
export async function checkRateLimit(
    request: Request,
    options: RateLimitOptions
): Promise<RateLimitResult> {
    // Bypass rate limiting in development mode
    const isDevelopment = process.env.NODE_ENV === "development";
    if (isDevelopment) {
        return {
            allowed: true,
            remaining: options.maxRequests,
            resetAt: Date.now() + options.windowMs,
        };
    }

    const adapter = getRateLimitAdapter();
    const key = options.identifier || getClientIP(request);
    return adapter.checkLimit(key, options);
}

/**
 * Get client IP address from request
 */
function getClientIP(request: Request): string {
    // Check various headers for the real IP (in case of proxies)
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        // x-forwarded-for can contain multiple IPs, take the first one
        return forwarded.split(",")[0].trim();
    }

    const realIP = request.headers.get("x-real-ip");
    if (realIP) {
        return realIP;
    }

    // Fallback to a default if we can't determine IP
    // In production, you might want to throw an error here
    return "unknown";
}

/**
 * Rate limit configuration presets for common auth endpoints
 */
export const rateLimitPresets = {
    // Login attempts: 5 per 5 minutes
    login: {
        maxRequests: 5,
        windowMs: 5 * 60 * 1000,
    },
    // Signup attempts: 5 per 10 min (increased from 3 for better UX)
    signup: {
        maxRequests: 5,
        windowMs: 10 * 60 * 1000,
    },
    // Password reset: 3 per hour
    passwordReset: {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000,
    },
    // Email confirmation resend: 3 per hour
    resendConfirmation: {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000,
    },
    // General auth endpoints: 20 per minute
    general: {
        maxRequests: 20,
        windowMs: 60 * 1000,
    },
} as const;

/**
 * Helper to create rate limit error response
 */
export function createRateLimitError(result: RateLimitResult): {
    error: string;
    status: number;
    headers: Headers;
} {
    const headers = new Headers();
    headers.set("X-RateLimit-Limit", result.resetAt.toString());
    headers.set("X-RateLimit-Remaining", result.remaining.toString());
    headers.set("X-RateLimit-Reset", new Date(result.resetAt).toISOString());
    if (result.retryAfter) {
        headers.set("Retry-After", result.retryAfter.toString());
    }

    return {
        error: result.retryAfter
            ? `Too many requests. Please try again in ${result.retryAfter} seconds.`
            : "Too many requests. Please try again later.",
        status: 429,
        headers,
    };
}
