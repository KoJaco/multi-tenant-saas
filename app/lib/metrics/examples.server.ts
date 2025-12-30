/**
 * Metrics Usage Examples
 *
 * This file demonstrates how to use the metrics system throughout the application.
 * These are examples - actual usage should be integrated into your route handlers.
 */

import {
    incrementCounter,
    recordGauge,
    recordHistogram,
    time,
    METRIC_NAMES,
} from "../metrics.server";
import { trackDbSelect, trackDbInsert } from "../db/metrics.server";
import { trackStripeCall, trackStripeWebhook } from "../stripe/metrics.server";
import { db } from "../db/index.server";
import Stripe from "stripe";

// ============================================================================
// Example 1: Database Query Tracking
// ============================================================================

export async function exampleDbQuery(accountId: string) {
    // Wrap database queries with tracking
    const account = await trackDbSelect("accounts", async () => {
        return await db.query.accounts.findFirst({
            where: (accounts, { eq }) => eq(accounts.id, accountId),
        });
    });

    return account;
}

// ============================================================================
// Example 2: Stripe API Call Tracking
// ============================================================================

export async function exampleStripeCall(stripe: Stripe, customerId: string) {
    // Wrap Stripe API calls with tracking
    const customer = await trackStripeCall(
        "customers",
        "retrieve",
        async () => {
            return await stripe.customers.retrieve(customerId);
        }
    );

    return customer;
}

// ============================================================================
// Example 3: Stripe Webhook Tracking
// ============================================================================

export async function exampleStripeWebhook(eventType: string) {
    // Track webhook events
    await trackStripeWebhook(eventType);

    // Process webhook...
}

// ============================================================================
// Example 4: Custom Business Metrics
// ============================================================================

export async function exampleBusinessMetrics(accountId: string) {
    // Track account creation
    await incrementCounter(METRIC_NAMES.ACCOUNT_CREATED, {
        account_id: accountId,
    });

    // Track user creation
    await incrementCounter(METRIC_NAMES.USER_CREATED, {
        account_id: accountId,
    });

    // Track subscription creation
    await incrementCounter(METRIC_NAMES.SUBSCRIPTION_CREATED, {
        account_id: accountId,
        plan: "pro",
    });
}

// ============================================================================
// Example 5: Timing Operations
// ============================================================================

export async function exampleTimingOperation() {
    // Time an async operation
    const result = await time("data_processing", async () => {
        // Simulate processing
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { processed: true };
    }, {
        source: "csv",
        account_id: "123",
    });

    return result;
}

// ============================================================================
// Example 6: Gauge Metrics (for current state)
// ============================================================================

export async function exampleGaugeMetrics() {
    // Track active sessions
    const activeSessions = 42;
    await recordGauge(METRIC_NAMES.AUTH_SESSION_COUNT, activeSessions, {
        account_id: "123",
    });

    // Track connection pool size
    const poolSize = 10;
    await recordGauge(METRIC_NAMES.DB_CONNECTION_POOL_SIZE, poolSize);
}

// ============================================================================
// Example 7: Histogram Metrics (for distributions)
// ============================================================================

export async function exampleHistogramMetrics(orderAmount: number) {
    // Track order value distribution
    await recordHistogram("order_value", orderAmount, {
        currency: "usd",
        account_id: "123",
    });
}

// ============================================================================
// Example 8: Error Tracking
// ============================================================================

export async function exampleErrorTracking() {
    try {
        // Your operation
        await someOperation();
    } catch (error) {
        // Track error count
        await incrementCounter("operation_errors_total", {
            operation: "some_operation",
            error_type: error instanceof Error ? error.name : "unknown",
        });

        throw error;
    }
}

async function someOperation() {
    // Example operation
}

// ============================================================================
// Example 9: Complete Route Handler with Metrics
// ============================================================================

export async function exampleRouteHandler(request: Request) {
    const startTime = Date.now();

    try {
        // Track request (middleware does this automatically, but here's manual example)
        await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
            method: request.method,
            path: new URL(request.url).pathname,
        });

        // Your route logic
        const data = await fetchData();

        // Track success
        const duration = Date.now() - startTime;
        await recordHistogram(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
            method: request.method,
            path: new URL(request.url).pathname,
            status: "200",
        });

        return { data };
    } catch (error) {
        // Track error
        const duration = Date.now() - startTime;
        await recordHistogram(METRIC_NAMES.HTTP_REQUEST_DURATION, duration, {
            method: request.method,
            path: new URL(request.url).pathname,
            status: "500",
        });

        throw error;
    }
}

async function fetchData() {
    return { data: "example" };
}

