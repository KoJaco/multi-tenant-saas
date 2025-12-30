/**
 * Request Middleware
 *
 * Middleware functions for request processing, including requestID tracking
 * and request/response logging.
 */

import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import {
    initRequestContext,
    withRequestContext,
    getRequestId,
} from "./request-context.server";
import { logRequest, logResponse } from "./logging.server";
import { incrementCounter, recordTimer, METRIC_NAMES } from "./metrics.server";

/**
 * Wrap a loader function with request context and logging
 */
export function withRequestMiddleware<T>(
    loader: (args: LoaderFunctionArgs) => Promise<T>
) {
    return async (args: LoaderFunctionArgs): Promise<T> => {
        const { request } = args;
        const context = initRequestContext(request);
        const startTime = Date.now();
        const url = new URL(request.url);
        const method = request.method;

        logRequest(request);

        try {
            const result = await withRequestContext(context, async () => {
                return await loader(args);
            });

            const duration = Date.now() - startTime;
            const status = 200;

            // Record metrics
            await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
                method,
                path: url.pathname,
                status: String(status),
            });
            await recordTimer(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
                method,
                path: url.pathname,
                status: String(status),
            });

            logResponse(status, url.pathname, duration);

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            const status =
                error && typeof error === "object" && "status" in error
                    ? (error.status as number)
                    : 500;

            // Record metrics for error
            await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
                method,
                path: url.pathname,
                status: String(status),
            });
            await recordTimer(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
                method,
                path: url.pathname,
                status: String(status),
            });

            logResponse(status, url.pathname, duration);

            throw error;
        }
    };
}

/**
 * Wrap an action function with request context and logging
 */
export function withActionMiddleware<T>(
    action: (args: ActionFunctionArgs) => Promise<T>
) {
    return async (args: ActionFunctionArgs): Promise<T> => {
        const { request } = args;
        const context = initRequestContext(request);
        const startTime = Date.now();
        const url = new URL(request.url);
        const method = request.method;

        logRequest(request);

        try {
            const result = await withRequestContext(context, async () => {
                return await action(args);
            });

            const duration = Date.now() - startTime;
            const status = 200;

            // Record metrics
            await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
                method,
                path: url.pathname,
                status: String(status),
            });
            await recordTimer(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
                method,
                path: url.pathname,
                status: String(status),
            });

            logResponse(status, url.pathname, duration);

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            const status =
                error && typeof error === "object" && "status" in error
                    ? (error.status as number)
                    : 500;

            // Record metrics for error
            await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
                method,
                path: url.pathname,
                status: String(status),
            });
            await recordTimer(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
                method,
                path: url.pathname,
                status: String(status),
            });

            logResponse(status, url.pathname, duration);

            throw error;
        }
    };
}

/**
 * Add requestID to response headers
 */
export function addRequestIdHeader(headers: Headers = new Headers()): Headers {
    const requestId = getRequestId();
    headers.set("X-Request-ID", requestId);
    return headers;
}

/**
 * Create a JSON response with requestID header
 */
export function jsonWithRequestId<T>(data: T, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    addRequestIdHeader(headers);
    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}

/**
 * Create a redirect response with requestID header
 */
export function redirectWithRequestId(
    url: string,
    init?: number | ResponseInit
): Response {
    const status = typeof init === "number" ? init : init?.status || 302;
    const headers = new Headers(
        typeof init === "object" ? init.headers : undefined
    );
    addRequestIdHeader(headers);
    return new Response(null, {
        status,
        headers: {
            Location: url,
            ...Object.fromEntries(headers),
        },
    });
}
