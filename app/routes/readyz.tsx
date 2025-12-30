/**
 * Readiness Check Endpoint
 * 
 * Comprehensive readiness check that verifies all required services are available.
 * Returns 200 if all checks pass, 503 if any check fails.
 * Used by Kubernetes readiness probes.
 * 
 * GET /readyz
 */

import { type LoaderFunctionArgs } from "react-router";
import { serverConfig } from "~/lib/config.server";
import postgres from "postgres";
import { initRequestContext, withRequestContext } from "~/lib/request-context.server";
import { jsonWithRequestId } from "~/lib/middleware.server";

interface HealthCheck {
    name: string;
    status: "ok" | "error" | "not_configured";
    message?: string;
    durationMs?: number;
}

async function checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
        const client = postgres(serverConfig.DATABASE_URL, { max: 1 });
        await client`SELECT 1`;
        await client.end();
        return {
            name: "database",
            status: "ok",
            durationMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            name: "database",
            status: "error",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        };
    }
}

async function checkStripe(): Promise<HealthCheck> {
    const startTime = Date.now();
    if (!serverConfig.STRIPE_SECRET_KEY) {
        return {
            name: "stripe",
            status: "not_configured",
            durationMs: Date.now() - startTime,
        };
    }

    try {
        // Simple check - try to create a Stripe client
        // In a real implementation, you might ping Stripe's API
        const Stripe = await import("stripe");
        const stripe = new Stripe.default(serverConfig.STRIPE_SECRET_KEY, {
            apiVersion: "2024-11-20.acacia",
        });
        
        // Ping Stripe API (list customers with limit 1)
        await stripe.customers.list({ limit: 1 });
        
        return {
            name: "stripe",
            status: "ok",
            durationMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            name: "stripe",
            status: "error",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        };
    }
}

async function checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();
    if (!serverConfig.REDIS_URL) {
        return {
            name: "redis",
            status: "not_configured",
            durationMs: Date.now() - startTime,
        };
    }

    try {
        // Dynamic import to avoid errors if ioredis is not installed
        const Redis = await import("ioredis");
        const redis = new Redis.default(serverConfig.REDIS_URL);
        
        await redis.ping();
        await redis.quit();
        
        return {
            name: "redis",
            status: "ok",
            durationMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            name: "redis",
            status: "error",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        };
    }
}

export async function loader({ request }: LoaderFunctionArgs) {
    const context = initRequestContext(request);
    
    return withRequestContext(context, async () => {
        const checks = await Promise.all([
            checkDatabase(),
            checkStripe(),
            checkRedis(),
        ]);

        const allOk = checks.every(
            (check) => check.status === "ok" || check.status === "not_configured"
        );
        const hasErrors = checks.some((check) => check.status === "error");

        const overallStatus = allOk ? "ok" : hasErrors ? "down" : "degraded";

        const response = {
            status: overallStatus,
            checks: checks.reduce(
                (acc, check) => {
                    acc[check.name] = {
                        status: check.status,
                        ...(check.message && { message: check.message }),
                        ...(check.durationMs && { durationMs: check.durationMs }),
                    };
                    return acc;
                },
                {} as Record<string, { status: string; message?: string; durationMs?: number }>
            ),
            timestamp: new Date().toISOString(),
        };

        return jsonWithRequestId(response, {
            status: allOk ? 200 : 503,
            headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        });
    });
}

