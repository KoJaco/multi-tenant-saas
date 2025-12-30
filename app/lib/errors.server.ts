/**
 * Error Handling Utilities
 *
 * Centralized error handling with classification, logging, and observability integration.
 */

import { logError } from "./logging.server";
import { getRequestId, getRequestContext } from "./request-context.server";
import { isProduction } from "./config.server";

export type ErrorClassification = "user" | "system" | "unknown";

export interface ErrorContext {
    userId?: string;
    accountId?: string;
    path?: string;
    method?: string;
    [key: string]: unknown;
}

/**
 * Classify error as user error or system error
 */
export function classifyError(error: Error | unknown): ErrorClassification {
    if (!(error instanceof Error)) {
        return "unknown";
    }

    // User errors (4xx)
    const userErrorPatterns = [
        /validation/i,
        /invalid/i,
        /unauthorized/i,
        /forbidden/i,
        /not found/i,
        /not_found/i,
        /bad request/i,
        /bad_request/i,
        /conflict/i,
        /duplicate/i,
    ];

    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    if (
        userErrorPatterns.some(
            (pattern) => pattern.test(errorMessage) || pattern.test(errorName)
        )
    ) {
        return "user";
    }

    // System errors (5xx)
    const systemErrorPatterns = [
        /database/i,
        /connection/i,
        /timeout/i,
        /internal/i,
        /server/i,
        /network/i,
        /external/i,
    ];

    if (
        systemErrorPatterns.some(
            (pattern) => pattern.test(errorMessage) || pattern.test(errorName)
        )
    ) {
        return "system";
    }

    // Check status codes if available
    if ("status" in error && typeof error.status === "number") {
        const status = error.status;
        if (status >= 400 && status < 500) {
            return "user";
        }
        if (status >= 500) {
            return "system";
        }
    }

    return "unknown";
}

/**
 * Check if error is a user error (4xx)
 */
export function isUserError(error: Error | unknown): boolean {
    return classifyError(error) === "user";
}

/**
 * Check if error is a system error (5xx)
 */
export function isSystemError(error: Error | unknown): boolean {
    return classifyError(error) === "system";
}

/**
 * Serialize error for safe client response
 * Removes sensitive information and stack traces in production
 */
export function serializeError(error: Error | unknown): {
    message: string;
    code?: string;
    status?: number;
    requestId: string;
} {
    const requestId = getRequestId();
    const context = getRequestContext();

    if (error instanceof Error) {
        const base = {
            message: isProduction
                ? "An error occurred. Please try again."
                : error.message,
            requestId,
        };

        if ("status" in error && typeof error.status === "number") {
            return {
                ...base,
                status: error.status,
            };
        }

        if ("code" in error && typeof error.code === "string") {
            return {
                ...base,
                code: error.code,
            };
        }

        return base;
    }

    return {
        message: "An unexpected error occurred.",
        requestId,
    };
}

/**
 * Handle error with logging and optional notification
 */
export async function handleError(
    error: Error | unknown,
    message: string,
    context?: ErrorContext,
    options?: {
        notify?: boolean;
        level?: "error" | "fatal";
    }
): Promise<void> {
    const classification = classifyError(error);
    const requestId = getRequestId();
    const requestContext = getRequestContext();

    // Merge context
    const fullContext: ErrorContext = {
        requestId,
        classification,
        ...requestContext,
        ...context,
    };

    // Log error
    logError(error, message, fullContext);

    // Notify observability services if configured
    if (options?.notify !== false) {
        try {
            const { notifyObservability } =
                await import("./observability/index.server");
            await notifyObservability(error, {
                message,
                level: options?.level || "error",
                classification,
                ...fullContext,
            });
        } catch (importError) {
            // Observability not configured, ignore
        }
    }
}

/**
 * Create a user-friendly error response
 */
export function createErrorResponse(
    error: Error | unknown,
    defaultMessage: string = "An error occurred",
    status: number = 500
): Response {
    const serialized = serializeError(error);
    const classification = classifyError(error);

    // Use appropriate status code based on classification
    const finalStatus =
        classification === "user" && status >= 500 ? 400 : status;

    return new Response(
        JSON.stringify({
            error: serialized.message,
            requestId: serialized.requestId,
            ...(serialized.code && { code: serialized.code }),
        }),
        {
            status: finalStatus,
            headers: {
                "Content-Type": "application/json",
                "X-Request-ID": serialized.requestId,
            },
        }
    );
}

export function createActionErrorResponse(
    message: string,
    status: number = 400
): { success: false; message: string; requestId: string; status: number } {
    return {
        success: false,
        message,
        requestId: getRequestId(),
        status,
    };
}
