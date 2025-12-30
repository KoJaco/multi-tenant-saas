/**
 * Metrics Endpoint
 *
 * Exposes metrics in Prometheus format for scraping.
 * Only available when using Prometheus adapter.
 */

import { type LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    const { getMetricsAdapter } = await import("~/lib/adapters/metrics/index");
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");

    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const adapter = await getMetricsAdapter();

            // Only Prometheus adapter supports getMetrics()
            if (adapter.getMetrics) {
                const metrics = await adapter.getMetrics();

                return new Response(metrics || "", {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "text/plain; version=0.0.4; charset=utf-8",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                    },
                });
            }

            // For other adapters, return JSON
            return {
                message:
                    "Metrics endpoint only available with Prometheus adapter",
                adapter: "in-memory",

                status: 200,
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            };
        } catch (error) {
            return {
                error: "Failed to retrieve metrics",
                message:
                    error instanceof Error ? error.message : "Unknown error",
                status: 500,
            };
        }
    });
}
