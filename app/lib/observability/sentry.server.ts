/**
 * Sentry Integration
 * 
 * Error tracking and performance monitoring with Sentry.
 * 
 * Setup:
 * 1. Install: npm install @sentry/remix
 * 2. Set environment variables:
 *    - SENTRY_DSN=your-sentry-dsn
 *    - SENTRY_ENVIRONMENT=production|staging|development
 * 3. Initialize in app/entry.server.tsx (see comments below)
 * 
 * Example initialization:
 * ```typescript
 * import * as Sentry from "@sentry/remix";
 * 
 * Sentry.init({
 *   dsn: process.env.SENTRY_DSN,
 *   environment: process.env.SENTRY_ENVIRONMENT || "development",
 *   tracesSampleRate: 1.0,
 *   beforeSend(event, hint) {
 *     // Add requestID to Sentry context
 *     if (hint.originalException) {
 *       event.tags = {
 *         ...event.tags,
 *         requestId: getRequestId(),
 *       };
 *     }
 *     return event;
 *   },
 * });
 * ```
 */

import { serverConfig } from "../config.server";
import { getRequestContext } from "../request-context.server";

let sentryInitialized = false;

/**
 * Initialize Sentry if DSN is configured
 */
export async function initSentry(): Promise<void> {
    if (sentryInitialized || !serverConfig.SENTRY_DSN) {
        return;
    }

    try {
        // Dynamic import to avoid errors if @sentry/remix is not installed
        const Sentry = await import("@sentry/remix");
        
        Sentry.init({
            dsn: serverConfig.SENTRY_DSN,
            environment: serverConfig.SENTRY_ENVIRONMENT || serverConfig.NODE_ENV,
            tracesSampleRate: serverConfig.NODE_ENV === "production" ? 0.1 : 1.0,
            beforeSend(event, hint) {
                const context = getRequestContext();
                if (context) {
                    event.tags = {
                        ...event.tags,
                        requestId: context.requestId,
                    };
                    if (context.userId) {
                        event.user = {
                            id: context.userId,
                        };
                    }
                }
                return event;
            },
        });

        sentryInitialized = true;
    } catch (error) {
        // @sentry/remix not installed, skip initialization
        console.warn("Sentry not available (package not installed)");
    }
}

/**
 * Capture an error in Sentry
 */
export async function captureError(
    error: Error | unknown,
    options?: {
        message?: string;
        level?: "error" | "fatal" | "warning" | "info";
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
    }
): Promise<void> {
    if (!serverConfig.SENTRY_DSN) {
        return;
    }

    try {
        await initSentry();
        const Sentry = await import("@sentry/remix");
        
        const context = getRequestContext();
        const fullOptions = {
            ...options,
            tags: {
                ...options?.tags,
                requestId: context?.requestId,
            },
            extra: {
                ...options?.extra,
                ...context,
            },
        };

        if (error instanceof Error) {
            Sentry.captureException(error, fullOptions);
        } else {
            Sentry.captureMessage(String(error), {
                ...fullOptions,
                level: options?.level || "error",
            });
        }
    } catch {
        // Sentry not available
    }
}

/**
 * Set user context in Sentry
 */
export async function setUser(userId: string, accountId?: string): Promise<void> {
    if (!serverConfig.SENTRY_DSN) {
        return;
    }

    try {
        await initSentry();
        const Sentry = await import("@sentry/remix");
        Sentry.setUser({
            id: userId,
            accountId,
        });
    } catch {
        // Sentry not available
    }
}

