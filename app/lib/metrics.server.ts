/**
 * Metrics Helper
 *
 * Convenience functions for recording metrics throughout the application.
 * Automatically uses the configured metrics adapter.
 */

import type { MetricLabels } from "./adapters/metrics";
import { getMetricsAdapter } from "./adapters/metrics/index";
/**
 * Record a counter increment
 */
export async function incrementCounter(
    name: string,
    labels?: MetricLabels,
    value?: number
): Promise<void> {
    const adapter = await getMetricsAdapter();
    await adapter.incrementCounter(name, { labels, value });
}

/**
 * Record a gauge value
 */
export async function recordGauge(
    name: string,
    value: number,
    labels?: MetricLabels
): Promise<void> {
    const adapter = await getMetricsAdapter();
    await adapter.recordGauge(name, { value, labels });
}

/**
 * Record a histogram value
 */
export async function recordHistogram(
    name: string,
    value: number,
    labels?: MetricLabels
): Promise<void> {
    const adapter = await getMetricsAdapter();
    await adapter.recordHistogram(name, value, { labels });
}

/**
 * Record a timer duration
 */
export async function recordTimer(
    name: string,
    durationMs: number,
    labels?: MetricLabels
): Promise<void> {
    const adapter = await getMetricsAdapter();
    await adapter.recordTimer(name, durationMs, { labels });
}

/**
 * Time an async function and record its duration
 */
export async function time<T>(
    name: string,
    fn: () => T | Promise<T>,
    labels?: MetricLabels
): Promise<T> {
    const adapter = await getMetricsAdapter();
    return adapter.time(name, fn, { labels });
}

/**
 * Start a timer and return a stop function
 */
export async function startTimer(
    name: string,
    labels?: MetricLabels
): Promise<() => void | Promise<void>> {
    const adapter = await getMetricsAdapter();
    return adapter.startTimer(name, { labels });
}

// Predefined metric names
export const METRIC_NAMES = {
    // HTTP metrics
    HTTP_REQUEST_COUNT: "http_requests_total",
    HTTP_REQUEST_DURATION: "http_request_duration_ms",
    HTTP_REQUEST_SIZE: "http_request_size_bytes",
    HTTP_RESPONSE_SIZE: "http_response_size_bytes",

    // Database metrics
    DB_QUERY_COUNT: "db_queries_total",
    DB_QUERY_DURATION: "db_query_duration_ms",
    DB_CONNECTION_POOL_SIZE: "db_connection_pool_size",
    DB_CONNECTION_POOL_ACTIVE: "db_connection_pool_active",

    // Stripe metrics
    STRIPE_API_CALL_COUNT: "stripe_api_calls_total",
    STRIPE_API_CALL_DURATION: "stripe_api_call_duration_ms",
    STRIPE_WEBHOOK_COUNT: "stripe_webhooks_total",

    // Auth metrics
    AUTH_LOGIN_COUNT: "auth_logins_total",
    AUTH_LOGOUT_COUNT: "auth_logouts_total",
    AUTH_SESSION_COUNT: "auth_sessions_active",

    // Business metrics
    ACCOUNT_CREATED: "accounts_created_total",
    USER_CREATED: "users_created_total",
    SUBSCRIPTION_CREATED: "subscriptions_created_total",
} as const;
