/**
 * Server-only Configuration
 *
 * Validates and exports server-side environment variables.
 * This module should NEVER be imported in client-side code.
 */

import { z } from "zod";

// Server-only environment schema
const serverEnvSchema = z.object({
    // Application
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    APP_URL: z.string().url(),

    // Database
    DATABASE_URL: z.string().min(1),

    // Supabase
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(1),

    // Session
    SESSION_SECRET: z
        .string()
        .min(32, "SESSION_SECRET must be at least 32 characters"),

    // Stripe (optional)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Webhooks (optional)
    APP_WEBHOOK_SECRET: z.string().optional(),

    // Email (optional)
    EMAIL_ADAPTER: z
        .enum(["supabase", "sendgrid", "resend"])
        .default("supabase")
        .optional(),
    SENDGRID_API_KEY: z.string().optional(),
    SENDGRID_FROM_EMAIL: z.string().email().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),

    // Redis (optional)
    REDIS_URL: z.string().url().optional(),

    // Branding (optional)
    APP_NAME: z.string().optional(),
    APP_SHORT_NAME: z.string().optional(),

    // Observability (optional)
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    HONEYCOMB_API_KEY: z.string().optional(),
    HONEYCOMB_DATASET: z.string().optional(),
    ROLLBAR_ACCESS_TOKEN: z.string().optional(),
    ROLLBAR_ENVIRONMENT: z.string().optional(),

    // Metrics (optional)
    METRICS_ADAPTERS: z.preprocess(
        (val) => {
            if (!val || typeof val !== "string") return ["in-memory"];
            const adapters = val.split(",").map((s) => s.trim().toLowerCase());
            // Validate each adapter
            const validAdapters = ["in-memory", "prometheus", "otel"];
            const filtered = adapters.filter((a) => validAdapters.includes(a));
            return filtered.length > 0 ? filtered : ["in-memory"];
        },
        z
            .array(z.enum(["in-memory", "prometheus", "otel"]))
            .default(["in-memory"])
    ),

    // Data Retention (optional, defaults in days)
    LOG_RETENTION_DAYS: z.preprocess(
        (val) => (val ? parseInt(String(val), 10) : 90),
        z.number().int().positive().default(90)
    ),
    SOFT_DELETE_RETENTION_DAYS: z.preprocess(
        (val) => (val ? parseInt(String(val), 10) : 30),
        z.number().int().positive().default(30)
    ),
    AUDIT_LOG_RETENTION_DAYS: z.preprocess(
        (val) => (val ? parseInt(String(val), 10) : 365),
        z.number().int().positive().default(365)
    ),
});

// Public (client-safe) environment schema
const publicEnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

// Validate server config at module load time
function getServerConfig() {
    const parsed = serverEnvSchema.safeParse(process.env);

    if (!parsed.success) {
        const errors = parsed.error.errors
            .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
            .join("\n");

        throw new Error(
            `❌ Invalid server environment configuration:\n${errors}\n\n` +
                `Please check your .env file or environment variables.`
        );
    }

    return parsed.data;
}

// Validate public config
function getPublicConfig() {
    const parsed = publicEnvSchema.safeParse({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    });

    if (!parsed.success) {
        const errors = parsed.error.errors
            .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
            .join("\n");

        throw new Error(
            `❌ Invalid public environment configuration:\n${errors}\n\n` +
                `These values are required for client-side code.`
        );
    }

    return parsed.data;
}

// Export validated configs
export const serverConfig = getServerConfig();
export const publicConfig = getPublicConfig();

// Type exports for use in other files
export type ServerConfig = typeof serverConfig;
export type PublicConfig = typeof publicConfig;

// Convenience getters
export const isProduction = serverConfig.NODE_ENV === "production";
export const isDevelopment = serverConfig.NODE_ENV === "development";
