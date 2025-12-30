/**
 * Stripe Metrics Helpers
 *
 * Helper functions to track Stripe API call metrics.
 * Wrap your Stripe API calls with these helpers.
 */

import { time, incrementCounter, METRIC_NAMES } from "../metrics.server";

/**
 * Track a Stripe API call
 */
export async function trackStripeCall<T>(
    resource: string,
    method: string,
    callFn: () => Promise<T>
): Promise<T> {
    const operation = `${resource}.${method}`;

    try {
        const result = await time(
            METRIC_NAMES.STRIPE_API_CALL_DURATION,
            callFn,
            { operation }
        );

        await incrementCounter(METRIC_NAMES.STRIPE_API_CALL_COUNT, {
            operation,
            resource,
            method,
            status: "success",
        });

        return result;
    } catch (error) {
        await incrementCounter(METRIC_NAMES.STRIPE_API_CALL_COUNT, {
            operation,
            resource,
            method,
            status: "error",
        });

        throw error;
    }
}

/**
 * Track a Stripe webhook event
 */
export async function trackStripeWebhook(
    eventType: string
): Promise<void> {
    await incrementCounter(METRIC_NAMES.STRIPE_WEBHOOK_COUNT, {
        event_type: eventType,
    });
}

