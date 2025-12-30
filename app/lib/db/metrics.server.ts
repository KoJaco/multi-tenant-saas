/**
 * Database Metrics Helpers
 *
 * Helper functions to track database query metrics.
 * Wrap your database operations with these helpers.
 */

import { time, incrementCounter, METRIC_NAMES } from "../metrics.server";

/**
 * Track a database query execution
 */
export async function trackDbQuery<T>(
    operation: string,
    table: string | undefined,
    queryFn: () => Promise<T>
): Promise<T> {
    try {
        const result = await time(
            METRIC_NAMES.DB_QUERY_DURATION,
            queryFn,
            { operation, table: table || "unknown" }
        );

        await incrementCounter(METRIC_NAMES.DB_QUERY_COUNT, {
            operation,
            table: table || "unknown",
            status: "success",
        });

        return result;
    } catch (error) {
        await incrementCounter(METRIC_NAMES.DB_QUERY_COUNT, {
            operation,
            table: table || "unknown",
            status: "error",
        });

        throw error;
    }
}

/**
 * Track a database execute operation (raw SQL)
 */
export async function trackDbExecute<T>(
    queryFn: () => Promise<T>
): Promise<T> {
    return trackDbQuery("execute", undefined, queryFn);
}

/**
 * Track a database select operation
 */
export async function trackDbSelect<T>(
    table: string,
    queryFn: () => Promise<T>
): Promise<T> {
    return trackDbQuery("select", table, queryFn);
}

/**
 * Track a database insert operation
 */
export async function trackDbInsert<T>(
    table: string,
    queryFn: () => Promise<T>
): Promise<T> {
    return trackDbQuery("insert", table, queryFn);
}

/**
 * Track a database update operation
 */
export async function trackDbUpdate<T>(
    table: string,
    queryFn: () => Promise<T>
): Promise<T> {
    return trackDbQuery("update", table, queryFn);
}

/**
 * Track a database delete operation
 */
export async function trackDbDelete<T>(
    table: string,
    queryFn: () => Promise<T>
): Promise<T> {
    return trackDbQuery("delete", table, queryFn);
}

