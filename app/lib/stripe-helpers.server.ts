/**
 * Stripe Helpers with RequestID Support
 * 
 * Helpers for integrating Stripe with requestID tracking.
 */

import { getRequestId } from "./request-context.server";

/**
 * Add requestID to Stripe metadata
 */
export function addRequestIdToStripeMetadata(
    metadata?: Record<string, string>
): Record<string, string> {
    const requestId = getRequestId();
    return {
        ...metadata,
        requestId,
    };
}

/**
 * Extract requestID from Stripe webhook event metadata
 */
export function getRequestIdFromStripeEvent(event: {
    metadata?: Record<string, string>;
}): string | undefined {
    return event.metadata?.requestId;
}

