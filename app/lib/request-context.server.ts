/**
 * Request Context Management
 *
 * Provides request-scoped context using AsyncLocalStorage for requestID tracking.
 * This allows requestID to be automatically included in all logs and error reports
 * without explicitly passing it through every function call.
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

interface RequestContext {
    requestId: string;
    userId?: string;
    accountId?: string;
    path?: string;
    method?: string;
    userAgent?: string;
    ipAddress?: string;
}

// Create AsyncLocalStorage instance for request context
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
}

/**
 * Get the current request ID
 */
export function getRequestId(): string {
    const context = getRequestContext();
    return context?.requestId || "unknown";
}

/**
 * Get the current user ID from context
 */
export function getContextUserId(): string | undefined {
    return getRequestContext()?.userId;
}

/**
 * Get the current account ID from context
 */
export function getContextAccountId(): string | undefined {
    return getRequestContext()?.accountId;
}

/**
 * Extract or generate request ID from request headers
 */
export function extractRequestId(request: Request): string {
    const headerId = request.headers.get("X-Request-ID");
    if (headerId) {
        return headerId;
    }
    return randomUUID();
}

/**
 * Run a function with request context
 * This is used to wrap request handlers and propagate context
 */
export async function withRequestContext<T>(
    context: Partial<RequestContext>,
    fn: () => Promise<T>
): Promise<T> {
    const fullContext: RequestContext = {
        requestId: context.requestId || randomUUID(),
        ...context,
    };
    return requestContextStorage.run(fullContext, fn);
}

/**
 * Extract IP address from request headers
 * Checks common proxy headers (X-Forwarded-For, X-Real-IP)
 */
export function extractIpAddress(request: Request): string | undefined {
    const forwardedFor = request.headers.get("X-Forwarded-For");
    if (forwardedFor) {
        // X-Forwarded-For can contain multiple IPs, take the first one
        return forwardedFor.split(",")[0].trim();
    }

    const realIp = request.headers.get("X-Real-IP");
    if (realIp) {
        return realIp.trim();
    }

    return undefined;
}

/**
 * Initialize request context from a Request object
 */
export function initRequestContext(request: Request): RequestContext {
    return {
        requestId: extractRequestId(request),
        path: new URL(request.url).pathname,
        method: request.method,
        userAgent: request.headers.get("User-Agent") || undefined,
        ipAddress: extractIpAddress(request),
    };
}
