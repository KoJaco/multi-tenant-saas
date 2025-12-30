/**
 * Metrics Adapter Factory
 *
 * Creates and initializes the appropriate metrics adapters based on configuration.
 * Supports multiple adapters for redundancy or different use cases.
 */

import type { MetricsAdapter } from "../metrics";
import { InMemoryMetricsAdapter } from "./in-memory";
import { PrometheusMetricsAdapter } from "./prometheus";
import { OTELMetricsAdapter } from "./otel";
import { serverConfig } from "~/lib/config.server";

/**
 * Multi-adapter wrapper that forwards calls to all configured adapters
 */
class MultiMetricsAdapter implements MetricsAdapter {
    private adapters: MetricsAdapter[];

    constructor(adapters: MetricsAdapter[]) {
        this.adapters = adapters;
    }

    async incrementCounter(name: string, options?: any): Promise<void> {
        await Promise.allSettled(
            this.adapters.map((adapter) =>
                adapter.incrementCounter(name, options)
            )
        );
    }

    async recordGauge(name: string, options: any): Promise<void> {
        await Promise.allSettled(
            this.adapters.map((adapter) => adapter.recordGauge(name, options))
        );
    }

    async recordHistogram(
        name: string,
        value: number,
        options?: any
    ): Promise<void> {
        await Promise.allSettled(
            this.adapters.map((adapter) =>
                adapter.recordHistogram(name, value, options)
            )
        );
    }

    startTimer(name: string, options?: any): () => Promise<void> {
        const stops = this.adapters.map((adapter) =>
            adapter.startTimer(name, options)
        );
        return async () => {
            await Promise.allSettled(stops.map((stop) => stop()));
        };
    }

    async recordTimer(
        name: string,
        durationMs: number,
        options?: any
    ): Promise<void> {
        await Promise.allSettled(
            this.adapters.map((adapter) =>
                adapter.recordTimer(name, durationMs, options)
            )
        );
    }

    async time<T>(
        name: string,
        fn: () => T | Promise<T>,
        options?: any
    ): Promise<T> {
        // Use the first adapter for timing, but record to all
        const result = await this.adapters[0]?.time(name, fn, options);
        return result as T;
    }

    async getMetrics(): Promise<string> {
        // Try to get metrics from adapters that support it
        const metricsPromises = this.adapters
            .filter((adapter) => adapter.getMetrics)
            .map((adapter) => adapter.getMetrics!());

        const results = await Promise.allSettled(metricsPromises);
        const metrics = results
            .filter(
                (r) => r.status === "fulfilled" && r.value && r.value.length > 0
            )
            .map((r) => (r as PromiseFulfilledResult<string>).value);

        return metrics.join("\n\n");
    }

    async cleanup(): Promise<void> {
        await Promise.allSettled(
            this.adapters
                .filter((adapter) => adapter.cleanup)
                .map((adapter) => adapter.cleanup!())
        );
    }
}

let metricsAdapter: MetricsAdapter | null = null;

/**
 * Create a single adapter instance
 */
async function createAdapter(
    adapterType: string
): Promise<MetricsAdapter | null> {
    switch (adapterType.toLowerCase()) {
        case "prometheus":
            try {
                return new PrometheusMetricsAdapter();
            } catch (error) {
                console.warn(
                    `Failed to initialize Prometheus adapter: ${error}`
                );
                return null;
            }

        case "otel":
        case "opentelemetry":
            try {
                return new OTELMetricsAdapter();
            } catch (error) {
                console.warn(`Failed to initialize OTEL adapter: ${error}`);
                return null;
            }

        case "in-memory":
            return new InMemoryMetricsAdapter();

        default:
            console.warn(`Unknown metrics adapter type: ${adapterType}`);
            return null;
    }
}

/**
 * Get or create the metrics adapter instance(s)
 */
export async function getMetricsAdapter(): Promise<MetricsAdapter> {
    if (metricsAdapter) {
        return metricsAdapter;
    }

    const adapterTypes = serverConfig.METRICS_ADAPTERS || ["in-memory"];

    const adapters: MetricsAdapter[] = [];

    for (const adapterType of adapterTypes) {
        const adapter = await createAdapter(adapterType);
        if (adapter) {
            adapters.push(adapter);
        }
    }

    // Always ensure at least one adapter (fallback to in-memory)
    if (adapters.length === 0) {
        adapters.push(new InMemoryMetricsAdapter());
    }

    // If only one adapter, use it directly; otherwise wrap in multi-adapter
    if (adapters.length === 1) {
        metricsAdapter = adapters[0];
    } else {
        metricsAdapter = new MultiMetricsAdapter(adapters);
    }

    return metricsAdapter;
}

/**
 * Initialize metrics adapter (call at startup)
 */
export async function initMetrics(): Promise<void> {
    await getMetricsAdapter();
}
