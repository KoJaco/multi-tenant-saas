/**
 * Observability Integration Adapter
 *
 * Unified interface for sending errors and events to observability services.
 * Supports Sentry, Honeycomb, and Rollbar with graceful degradation.
 */

import { getRequestContext } from "../request-context.server";
import type { ErrorContext } from "../errors.server";

interface ObservabilityEvent {
    error?: Error | unknown;
    message: string;
    level?: "error" | "fatal" | "info" | "warning";
    classification?: "user" | "system" | "unknown";
    context?: ErrorContext;
}

/**
 * Notify all configured observability services
 */
export async function notifyObservability(
    error: Error | unknown,
    event: Omit<ObservabilityEvent, "error">
): Promise<void> {
    const requestContext = getRequestContext();
    const fullEvent: ObservabilityEvent = {
        error,
        ...event,
        context: {
            ...requestContext,
            ...event.context,
        },
    };

    // Try to send to each service (failures are logged but don't block)
    const { logger } = await import("../logging.server");
    const promises = [
        notifySentry(fullEvent).catch((err) => {
            logger.debug("Failed to notify Sentry", { error: String(err) });
        }),
        notifyHoneycomb(fullEvent).catch((err) => {
            logger.debug("Failed to notify Honeycomb", { error: String(err) });
        }),
        notifyRollbar(fullEvent).catch((err) => {
            logger.debug("Failed to notify Rollbar", { error: String(err) });
        }),
    ];

    await Promise.allSettled(promises);
}

/**
 * Notify Sentry (if configured)
 */
async function notifySentry(event: ObservabilityEvent): Promise<void> {
    try {
        const sentry = await import("./sentry.server");
        await sentry.captureError(event.error, {
            message: event.message,
            level: event.level || undefined,
            tags: {
                classification: event.classification || "unknown",
            },
            extra: event.context,
        });
    } catch {
        // Sentry not configured or failed to import
    }
}

/**
 * Notify Honeycomb (if configured)
 */
async function notifyHoneycomb(event: ObservabilityEvent): Promise<void> {
    try {
        const honeycomb = await import("./honeycomb.server");
        await honeycomb.sendEvent({
            name: event.message,
            level: event.level || undefined,
            error: event.error,
            ...event.context,
        });
    } catch {
        // Honeycomb not configured or failed to import
    }
}

/**
 * Notify Rollbar (if configured)
 */
async function notifyRollbar(event: ObservabilityEvent): Promise<void> {
    try {
        const rollbar = await import("./rollbar.server");
        await rollbar.reportError(event.error, {
            message: event.message,
            level: event.level,
            custom: event.context,
        });
    } catch {
        // Rollbar not configured or failed to import
    }
}
