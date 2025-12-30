/**
 * Prometheus Metrics Adapter
 *
 * Prometheus metrics adapter using prom-client.
 *
 * Setup:
 * 1. Install: npm install prom-client
 * 2. Set environment variable: METRICS_ADAPTER=prometheus
 * 3. Metrics will be available at /metrics endpoint
 */

import type {
    MetricsAdapter,
    MetricLabels,
    CounterOptions,
    GaugeOptions,
    HistogramOptions,
    TimerOptions,
} from "../metrics";
import { serverConfig } from "~/lib/config.server";

let promClient: typeof import("prom-client") | null = null;
let registry: any = null;
let counters: Map<string, any> = new Map();
let gauges: Map<string, any> = new Map();
let histograms: Map<string, any> = new Map();

async function initPrometheus() {
    if (promClient) return;

    try {
        promClient = await import("prom-client");
        registry = new promClient.Registry();

        // Add default metrics (CPU, memory, etc.)
        promClient.collectDefaultMetrics({ register: registry });
    } catch (error) {
        console.warn(
            "Prometheus client not available. Install with: npm install prom-client"
        );
        throw error;
    }
}

function labelsToString(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) return "";
    return (
        "{" +
        Object.entries(labels)
            .map(([k, v]) => `${k}="${String(v)}"`)
            .join(",") +
        "}"
    );
}

export class PrometheusMetricsAdapter implements MetricsAdapter {
    private initialized = false;

    private async ensureInitialized() {
        if (!this.initialized) {
            await initPrometheus();
            this.initialized = true;
        }
    }

    async incrementCounter(
        name: string,
        options?: CounterOptions
    ): Promise<void> {
        await this.ensureInitialized();
        if (!promClient || !registry) return;

        const key = `${name}${labelsToString(options?.labels)}`;
        let counter = counters.get(key);

        if (!counter) {
            counter = new promClient.Counter({
                name: name.replace(/[^a-zA-Z0-9_]/g, "_"),
                help: `Counter metric: ${name}`,
                labelNames: options?.labels
                    ? Object.keys(options.labels)
                    : undefined,
                registers: [registry],
            });
            counters.set(key, counter);
        }

        counter.inc(options?.labels || {}, options?.value || 1);
    }

    async recordGauge(name: string, options: GaugeOptions): Promise<void> {
        await this.ensureInitialized();
        if (!promClient || !registry) return;

        const key = `${name}${labelsToString(options.labels)}`;
        let gauge = gauges.get(key);

        if (!gauge) {
            gauge = new promClient.Gauge({
                name: name.replace(/[^a-zA-Z0-9_]/g, "_"),
                help: `Gauge metric: ${name}`,
                labelNames: options.labels
                    ? Object.keys(options.labels)
                    : undefined,
                registers: [registry],
            });
            gauges.set(key, gauge);
        }

        gauge.set(options.labels || {}, options.value);
    }

    async recordHistogram(
        name: string,
        value: number,
        options?: HistogramOptions
    ): Promise<void> {
        await this.ensureInitialized();
        if (!promClient || !registry) return;

        const key = `${name}${labelsToString(options?.labels)}`;
        let histogram = histograms.get(key);

        if (!histogram) {
            histogram = new promClient.Histogram({
                name: name.replace(/[^a-zA-Z0-9_]/g, "_"),
                help: `Histogram metric: ${name}`,
                labelNames: options?.labels
                    ? Object.keys(options.labels)
                    : undefined,
                buckets: options?.buckets || [
                    0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000,
                    2500, 5000, 10000,
                ],
                registers: [registry],
            });
            histograms.set(key, histogram);
        }

        histogram.observe(options?.labels || {}, value);
    }

    startTimer(name: string, options?: TimerOptions): () => Promise<void> {
        const startTime = Date.now();
        return async () => {
            const duration = Date.now() - startTime;
            await this.recordTimer(name, duration, options);
        };
    }

    async recordTimer(
        name: string,
        durationMs: number,
        options?: TimerOptions
    ): Promise<void> {
        await this.recordHistogram(name, durationMs, options);
    }

    async time<T>(
        name: string,
        fn: () => T | Promise<T>,
        options?: TimerOptions
    ): Promise<T> {
        const stop = this.startTimer(name, options);
        try {
            const result = await fn();
            await stop();
            return result;
        } catch (error) {
            await stop();
            throw error;
        }
    }

    async getMetrics(): Promise<string> {
        await this.ensureInitialized();
        if (!registry) return "";
        return await registry.metrics();
    }
}

