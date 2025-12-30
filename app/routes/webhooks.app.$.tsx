/**
 * App Webhook Handler
 *
 * Generic webhook handler for app webhooks (e.g., /webhooks/app/custom-service)
 * Uses HMAC signature verification for security
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { processWebhook } from "~/lib/webhooks/handler.server";
import { AppWebhookVerifier } from "~/lib/webhooks/app.server";
import type { WebhookHandler } from "~/lib/webhooks/types.server";
import { initRequestContext, withRequestContext } from "~/lib/request-context.server";
import { logger } from "~/lib/logging.server";

/**
 * Get handlers for app webhooks based on the webhook path
 * Override this function in specific webhook route files to register handlers
 */
export function getAppWebhookHandlers(
    webhookPath: string
): Map<string, WebhookHandler> {
    // Default: no handlers (override in specific routes)
    logger.warn("No handlers registered for app webhook", { webhookPath });
    return new Map();
}

export async function action({ request, params }: ActionFunctionArgs) {
    const context = initRequestContext(request);
    const webhookPath = params["*"] || "";

    return withRequestContext(context, async () => {
        const verifier = new AppWebhookVerifier();
        const handlers = getAppWebhookHandlers(webhookPath);

        return processWebhook(request, {
            verifier,
            handlers,
            source: `app:${webhookPath}`,
        });
    });
}

// Webhooks should only accept POST requests
export async function loader({ request }: LoaderFunctionArgs) {
    return new Response("Method not allowed", { status: 405 });
}

