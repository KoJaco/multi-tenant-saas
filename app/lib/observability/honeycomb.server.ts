/**
 * Honeycomb Integration
 *
 * Distributed tracing and observability with Honeycomb.
 *
 * Setup:
 * 1. Install:
 * - npm install libhoney
 * - npm i --save-dev @types/libhoney
 * 2. Set environment variables:
 *    - HONEYCOMB_API_KEY=your-api-key
 *    - HONEYCOMB_DATASET=your-dataset-name
 * 3. Initialize in app/entry.server.tsx
 *
 * Example usage:
 * ```typescript
 * import { initHoneycomb, startSpan } from "~/lib/observability/honeycomb.server";
 *
 * await initHoneycomb();
 *
 * await startSpan("operation-name", async (span) => {
 *   span.addField("key", "value");
 *   // Your code here
 * });
 * ```
 */

import { serverConfig } from "../config.server";
import { getRequestContext } from "../request-context.server";

let honeycombClient: any = null;

/**
 * Initialize Honeycomb if API key is configured
 */
export async function initHoneycomb(): Promise<void> {
    if (honeycombClient || !serverConfig.HONEYCOMB_API_KEY) {
        return;
    }

    try {
        // Dynamic import to avoid errors if libhoney is not installed
        const libhoney = await import("libhoney");

        honeycombClient = new libhoney.default({
            writeKey: serverConfig.HONEYCOMB_API_KEY,
            dataset: serverConfig.HONEYCOMB_DATASET || "multi-tenant-app",
        });

        console.log("Honeycomb initialized");
    } catch (error) {
        // libhoney not installed, skip initialization
        console.warn("Honeycomb not available (package not installed)");
    }
}

/**
 * Send an event to Honeycomb
 */
export async function sendEvent(data: {
    name: string;
    level?: "error" | "fatal" | "info" | "warning";
    error?: Error | unknown;
    [key: string]: unknown;
}): Promise<void> {
    if (!serverConfig.HONEYCOMB_API_KEY) {
        return;
    }

    try {
        await initHoneycomb();
        if (!honeycombClient) {
            return;
        }

        const context = getRequestContext();
        const event = honeycombClient.newEvent();

        event.add({
            level: data.level || "info",
            ...(context?.requestId && { requestId: context.requestId }),
            ...(context?.userId && { userId: context.userId }),
            ...(context?.accountId && { accountId: context.accountId }),
            ...(context?.path && { path: context.path }),
            ...(context?.method && { method: context.method }),
            ...(data.error instanceof Error && {
                error_name: data.error.name,
                error_message: data.error.message,
            }),
            ...data,
        });

        event.send();
    } catch {
        // Honeycomb not available
    }
}

/**
 * Start a span for distributed tracing
 */
export async function startSpan<T>(
    name: string,
    fn: (span: any) => Promise<T>
): Promise<T> {
    if (!serverConfig.HONEYCOMB_API_KEY) {
        return fn({ addField: () => {}, addTraceField: () => {} });
    }

    try {
        await initHoneycomb();
        if (!honeycombClient) {
            return fn({ addField: () => {}, addTraceField: () => {} });
        }

        const span = honeycombClient.newEvent();
        span.addField("name", name);

        const startTime = Date.now();
        try {
            const result = await fn(span);
            const duration = Date.now() - startTime;
            span.addField("duration_ms", duration);
            span.send();
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            span.addField("duration_ms", duration);
            span.addField("error", true);
            if (error instanceof Error) {
                span.addField("error_name", error.name);
                span.addField("error_message", error.message);
            }
            span.send();
            throw error;
        }
    } catch {
        // Honeycomb not available, execute function anyway
        return fn({ addField: () => {}, addTraceField: () => {} });
    }
}
