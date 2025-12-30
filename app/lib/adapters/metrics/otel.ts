/**
 * OpenTelemetry Metrics Adapter
 *
 * OpenTelemetry metrics adapter using @opentelemetry/api.
 *
 * Setup:
 * 1. Install: npm install @opentelemetry/api @opentelemetry/sdk-metrics
 * 2. Set environment variable: METRICS_ADAPTER=otel
 * 3. Configure OTEL exporter (e.g., OTLP endpoint)
 */

import type {
    MetricsAdapter,
    MetricLabels,
    CounterOptions,
    GaugeOptions,
    HistogramOptions,
    TimerOptions,
} from "../metrics";

let metricsApi: typeof import("@opentelemetry/api") | null = null;
let sdkMetrics: typeof import("@opentelemetry/sdk-metrics") | null = null;
let meter: any = null;
let counters: Map<string, any> = new Map();
let gauges: Map<string, any> = new Map();
let histograms: Map<string, any> = new Map();

async function initOTEL() {
    if (metricsApi) return;

    try {
        metricsApi = await import("@opentelemetry/api");
        sdkMetrics = await import("@opentelemetry/sdk-metrics");

        // Get or create meter
        meter = metricsApi.metrics.getMeter("multi-tenant-saas", "1.0.0");
    } catch (error) {
        console.warn(
            "OpenTelemetry not available. Install with: npm install @opentelemetry/api @opentelemetry/sdk-metrics"
        );
        throw error;
    }
}

export class OTELMetricsAdapter implements MetricsAdapter {
    private initialized = false;

    private async ensureInitialized() {
        if (!this.initialized) {
            await initOTEL();
            this.initialized = true;
        }
    }

    async incrementCounter(
        name: string,
        options?: CounterOptions
    ): Promise<void> {
        await this.ensureInitialized();
        if (!meter) return;

        const key = name;
        let counter = counters.get(key);

        if (!counter) {
            counter = meter.createCounter(name, {
                description: `Counter metric: ${name}`,
            });
            counters.set(key, counter);
        }

        counter.add(options?.value || 1, options?.labels || {});
    }

    async recordGauge(name: string, options: GaugeOptions): Promise<void> {
        await this.ensureInitialized();
        if (!meter) return;

        const key = name;
        let gauge = gauges.get(key);

        if (!gauge) {
            gauge = meter.createUpDownCounter(name, {
                description: `Gauge metric: ${name}`,
            });
            gauges.set(key, gauge);
        }

        gauge.add(options.value, options.labels || {});
    }

    async recordHistogram(
        name: string,
        value: number,
        options?: HistogramOptions
    ): Promise<void> {
        await this.ensureInitialized();
        if (!meter) return;

        const key = name;
        let histogram = histograms.get(key);

        if (!histogram) {
            histogram = meter.createHistogram(name, {
                description: `Histogram metric: ${name}`,
            });
            histograms.set(key, histogram);
        }

        histogram.record(value, options?.labels || {});
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
}

