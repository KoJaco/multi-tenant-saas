/**
 * Metrics Adapter Interface and Implementations
 *
 * Provides a flexible adapter pattern for metrics collection.
 * Supports in-memory (development), Prometheus, and OpenTelemetry implementations.
 */

/**
 * Metric labels/tags for filtering and grouping
 */
export interface MetricLabels {
    [key: string]: string | number | boolean | undefined;
}

/**
 * Histogram metric options
 */
export interface HistogramOptions {
    buckets?: number[]; // Custom buckets for histogram
    labels?: MetricLabels;
}

/**
 * Counter metric options
 */
export interface CounterOptions {
    labels?: MetricLabels;
    value?: number; // Increment by this value (default: 1)
}

/**
 * Gauge metric options
 */
export interface GaugeOptions {
    labels?: MetricLabels;
    value: number;
}

/**
 * Timer metric options
 */
export interface TimerOptions {
    labels?: MetricLabels;
}

/**
 * Metrics adapter interface
 */
export interface MetricsAdapter {
    /**
     * Record a counter increment
     * Use for counting events (e.g., request count, error count)
     */
    incrementCounter(
        name: string,
        options?: CounterOptions
    ): void | Promise<void>;

    /**
     * Record a gauge value
     * Use for values that can go up and down (e.g., active connections, queue size)
     */
    recordGauge(name: string, options: GaugeOptions): void | Promise<void>;

    /**
     * Record a histogram value
     * Use for distributions (e.g., request duration, response size)
     */
    recordHistogram(
        name: string,
        value: number,
        options?: HistogramOptions
    ): void | Promise<void>;

    /**
     * Start a timer and return a function to stop it
     * Returns a function that records the duration when called
     */
    startTimer(
        name: string,
        options?: TimerOptions
    ): () => void | Promise<void>;

    /**
     * Record a timer duration directly
     * Convenience method for recording duration after async operation
     */
    recordTimer(
        name: string,
        durationMs: number,
        options?: TimerOptions
    ): void | Promise<void>;

    /**
     * Execute a function and record its duration
     */
    time<T>(
        name: string,
        fn: () => T | Promise<T>,
        options?: TimerOptions
    ): Promise<T>;

    /**
     * Get metrics in a format suitable for scraping (Prometheus format)
     * Returns empty string if not applicable
     */
    getMetrics?(): string | Promise<string>;

    /**
     * Cleanup resources (for in-memory implementations)
     */
    cleanup?(): void | Promise<void>;
}
