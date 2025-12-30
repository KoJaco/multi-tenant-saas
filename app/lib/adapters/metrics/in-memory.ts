/**
 * In-Memory Metrics Adapter
 *
 * Simple in-memory metrics adapter for development and testing.
 * Stores metrics in memory and provides basic aggregation.
 */

import type {
    MetricsAdapter,
    MetricLabels,
    CounterOptions,
    GaugeOptions,
    HistogramOptions,
    TimerOptions,
} from "../metrics";

interface CounterMetric {
    name: string;
    labels: MetricLabels;
    count: number;
}

interface GaugeMetric {
    name: string;
    labels: MetricLabels;
    value: number;
}

interface HistogramMetric {
    name: string;
    labels: MetricLabels;
    values: number[];
    buckets: number[];
}

export class InMemoryMetricsAdapter implements MetricsAdapter {
    private counters = new Map<string, CounterMetric>();
    private gauges = new Map<string, GaugeMetric>();
    private histograms = new Map<string, HistogramMetric>();

    private getCounterKey(name: string, labels?: MetricLabels): string {
        const labelStr = labels
            ? Object.entries(labels)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => `${k}=${v}`)
                  .join(",")
            : "";
        return labelStr ? `${name}{${labelStr}}` : name;
    }

    private getGaugeKey(name: string, labels?: MetricLabels): string {
        return this.getCounterKey(name, labels);
    }

    private getHistogramKey(name: string, labels?: MetricLabels): string {
        return this.getCounterKey(name, labels);
    }

    incrementCounter(name: string, options?: CounterOptions): void {
        const key = this.getCounterKey(name, options?.labels);
        const existing = this.counters.get(key);
        const value = options?.value || 1;

        if (existing) {
            existing.count += value;
        } else {
            this.counters.set(key, {
                name,
                labels: options?.labels || {},
                count: value,
            });
        }
    }

    recordGauge(name: string, options: GaugeOptions): void {
        const key = this.getGaugeKey(name, options.labels);
        this.gauges.set(key, {
            name,
            labels: options.labels || {},
            value: options.value,
        });
    }

    recordHistogram(
        name: string,
        value: number,
        options?: HistogramOptions
    ): void {
        const key = this.getHistogramKey(name, options?.labels);
        const existing = this.histograms.get(key);
        const buckets = options?.buckets || [
            0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
            10000,
        ];

        if (existing) {
            existing.values.push(value);
        } else {
            this.histograms.set(key, {
                name,
                labels: options?.labels || {},
                values: [value],
                buckets,
            });
        }
    }

    startTimer(name: string, options?: TimerOptions): () => void {
        const startTime = Date.now();
        return () => {
            const duration = Date.now() - startTime;
            this.recordTimer(name, duration, options);
        };
    }

    recordTimer(name: string, durationMs: number, options?: TimerOptions): void {
        this.recordHistogram(name, durationMs, options);
    }

    async time<T>(
        name: string,
        fn: () => T | Promise<T>,
        options?: TimerOptions
    ): Promise<T> {
        const stop = this.startTimer(name, options);
        try {
            const result = await fn();
            stop();
            return result;
        } catch (error) {
            stop();
            throw error;
        }
    }

    /**
     * Get all metrics as a simple object (for debugging)
     */
    getMetrics(): string {
        const lines: string[] = [];

        // Counters
        for (const [key, metric] of this.counters.entries()) {
            lines.push(`# TYPE ${metric.name} counter`);
            lines.push(`${key} ${metric.count}`);
        }

        // Gauges
        for (const [key, metric] of this.gauges.entries()) {
            lines.push(`# TYPE ${metric.name} gauge`);
            lines.push(`${key} ${metric.value}`);
        }

        // Histograms
        for (const [key, metric] of this.histograms.entries()) {
            lines.push(`# TYPE ${metric.name} histogram`);
            const sum = metric.values.reduce((a, b) => a + b, 0);
            const count = metric.values.length;
            lines.push(`${key}_sum ${sum}`);
            lines.push(`${key}_count ${count}`);
            // Bucket counts
            for (const bucket of metric.buckets) {
                const bucketCount = metric.values.filter((v) => v <= bucket).length;
                lines.push(`${key}_bucket{le="${bucket}"} ${bucketCount}`);
            }
            lines.push(`${key}_bucket{le="+Inf"} ${count}`);
        }

        return lines.join("\n");
    }

    /**
     * Get metrics as JSON (for debugging)
     */
    getMetricsJson() {
        return {
            counters: Array.from(this.counters.values()),
            gauges: Array.from(this.gauges.values()),
            histograms: Array.from(this.histograms.values()).map((h) => ({
                ...h,
                sum: h.values.reduce((a, b) => a + b, 0),
                count: h.values.length,
                min: Math.min(...h.values),
                max: Math.max(...h.values),
                avg: h.values.reduce((a, b) => a + b, 0) / h.values.length,
            })),
        };
    }

    cleanup(): void {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }
}

