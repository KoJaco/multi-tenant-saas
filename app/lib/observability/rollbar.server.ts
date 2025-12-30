/**
 * Rollbar Integration
 * 
 * Error tracking and monitoring with Rollbar.
 * 
 * Setup:
 * 1. Install: npm install rollbar
 * 2. Set environment variables:
 *    - ROLLBAR_ACCESS_TOKEN=your-access-token
 *    - ROLLBAR_ENVIRONMENT=production|staging|development
 * 3. Initialize in app/entry.server.tsx
 * 
 * Example initialization:
 * ```typescript
 * import { initRollbar } from "~/lib/observability/rollbar.server";
 * 
 * await initRollbar();
 * ```
 */

import { serverConfig } from "../config.server";
import { getRequestContext } from "../request-context.server";

let rollbarClient: any = null;

/**
 * Initialize Rollbar if access token is configured
 */
export async function initRollbar(): Promise<void> {
    if (rollbarClient || !serverConfig.ROLLBAR_ACCESS_TOKEN) {
        return;
    }

    try {
        // Dynamic import to avoid errors if rollbar is not installed
        const Rollbar = await import("rollbar");
        
        rollbarClient = new Rollbar.default({
            accessToken: serverConfig.ROLLBAR_ACCESS_TOKEN,
            environment: serverConfig.ROLLBAR_ENVIRONMENT || serverConfig.NODE_ENV,
            captureUncaught: true,
            captureUnhandledRejections: true,
        });

        console.log("Rollbar initialized");
    } catch (error) {
        // rollbar not installed, skip initialization
        console.warn("Rollbar not available (package not installed)");
    }
}

/**
 * Report an error to Rollbar
 */
export async function reportError(
    error: Error | unknown,
    options?: {
        message?: string;
        level?: "error" | "fatal" | "warning" | "info";
        custom?: Record<string, unknown>;
    }
): Promise<void> {
    if (!serverConfig.ROLLBAR_ACCESS_TOKEN) {
        return;
    }

    try {
        await initRollbar();
        if (!rollbarClient) {
            return;
        }

        const context = getRequestContext();
        const customData = {
            ...options?.custom,
            ...(context?.requestId && { requestId: context.requestId }),
            ...(context?.userId && { userId: context.userId }),
            ...(context?.accountId && { accountId: context.accountId }),
            ...(context?.path && { path: context.path }),
            ...(context?.method && { method: context.method }),
        };

        if (error instanceof Error) {
            rollbarClient.error(
                options?.message || error.message,
                error,
                {
                    custom: customData,
                    level: options?.level || "error",
                }
            );
        } else {
            rollbarClient.error(
                options?.message || String(error),
                {
                    custom: {
                        ...customData,
                        error: String(error),
                    },
                    level: options?.level || "error",
                }
            );
        }
    } catch {
        // Rollbar not available
    }
}

/**
 * Set user context in Rollbar
 */
export async function setUser(userId: string, accountId?: string): Promise<void> {
    if (!serverConfig.ROLLBAR_ACCESS_TOKEN) {
        return;
    }

    try {
        await initRollbar();
        if (!rollbarClient) {
            return;
        }

        rollbarClient.configure({
            payload: {
                person: {
                    id: userId,
                    accountId,
                },
            },
        });
    } catch {
        // Rollbar not available
    }
}

