/**
 * Logging Utility
 *
 * Provides structured logging for server-side code with requestID tracking.
 * Replaces console.log/error/warn with consistent logging.
 */

import { getRequestContext } from "./request-context.server";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
    [key: string]: unknown;
}

/**
 * Structured logger for server-side code
 */
class Logger {
    private isDevelopment = process.env.NODE_ENV === "development";

    private log(level: LogLevel, message: string, context?: LogContext) {
        const timestamp = new Date().toISOString();
        const requestContext = getRequestContext();

        const logEntry = {
            timestamp,
            level,
            message,
            requestId: requestContext?.requestId,
            ...(requestContext?.userId && { userId: requestContext.userId }),
            ...(requestContext?.accountId && {
                accountId: requestContext.accountId,
            }),
            ...(requestContext?.path && { path: requestContext.path }),
            ...(requestContext?.method && { method: requestContext.method }),
            ...(context && { context }),
        };

        // In development, use console for better readability
        if (this.isDevelopment) {
            const consoleMethod =
                level === "error" || level === "fatal"
                    ? console.error
                    : level === "warn"
                      ? console.warn
                      : level === "debug" || level === "trace"
                        ? console.debug
                        : console.log;

            const prefix = `[${level.toUpperCase()}]${requestContext?.requestId ? ` [${requestContext.requestId}]` : ""}`;
            consoleMethod(`${prefix} ${message}`, context || "");
        } else {
            // In production, structured JSON format
            const logString = JSON.stringify(logEntry);
            if (level === "error" || level === "fatal") {
                console.error(logString);
            } else if (level === "warn") {
                console.warn(logString);
            } else {
                console.log(logString);
            }
        }
    }

    trace(message: string, context?: LogContext) {
        if (this.isDevelopment) {
            this.log("trace", message, context);
        }
    }

    debug(message: string, context?: LogContext) {
        if (this.isDevelopment) {
            this.log("debug", message, context);
        }
    }

    info(message: string, context?: LogContext) {
        this.log("info", message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log("warn", message, context);
    }

    error(message: string, context?: LogContext) {
        this.log("error", message, context);
    }

    fatal(message: string, context?: LogContext) {
        this.log("fatal", message, context);
    }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Helper function for logging authentication events
 */
export function logAuthEvent(
    event: string,
    userId?: string,
    context?: LogContext
) {
    logger.info(`Auth: ${event}`, {
        userId,
        ...context,
    });
}

/**
 * Helper function for logging database operations
 */
export function logDbOperation(
    operation: string,
    table?: string,
    context?: LogContext
) {
    logger.debug(`DB: ${operation}`, {
        table,
        ...context,
    });
}

/**
 * Helper function for logging errors with full context
 */
export function logError(
    error: Error | unknown,
    message: string,
    context?: LogContext
) {
    const errorContext = {
        error:
            error instanceof Error
                ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                  }
                : String(error),
        ...context,
    };

    logger.error(message, errorContext);
}

/**
 * Log HTTP request details
 */
export function logRequest(request: Request, context?: LogContext) {
    const url = new URL(request.url);
    logger.info("HTTP Request", {
        method: request.method,
        path: url.pathname,
        query: url.search,
        userAgent: request.headers.get("User-Agent"),
        ...context,
    });
}

/**
 * Log HTTP response details
 */
export function logResponse(
    status: number,
    path: string,
    duration?: number,
    context?: LogContext
) {
    logger.info("HTTP Response", {
        status,
        path,
        ...(duration && { durationMs: duration }),
        ...context,
    });
}
