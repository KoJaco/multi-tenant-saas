/**
 * Unified Webhook Handler
 *
 * Processes webhooks with idempotency, verification, and error handling
 */

import { buffer } from "node:stream/consumers";
import type { WebhookVerifier, WebhookHandler, WebhookEvent } from "./types.server";
import {
    processWebhookWithIdempotency,
    isEventProcessed,
} from "./idempotency.server";
import { logger } from "~/lib/logging.server";
import { handleError } from "~/lib/errors.server";
import { trackStripeWebhook } from "~/lib/stripe/metrics.server";

export interface WebhookHandlerConfig {
    verifier: WebhookVerifier;
    handlers: Map<string, WebhookHandler>;
    source: string;
}

/**
 * Process a webhook request
 */
export async function processWebhook(
    request: Request,
    config: WebhookHandlerConfig
): Promise<Response> {
    try {
        // Get raw body (required for signature verification)
        const rawBody = await buffer(request.body as any);

        // Verify webhook signature
        let event: WebhookEvent;
        try {
            event = await config.verifier.verify(request, rawBody);
        } catch (error) {
            logger.warn("Webhook signature verification failed", {
                source: config.source,
                error: error instanceof Error ? error.message : String(error),
            });
            return new Response(
                JSON.stringify({
                    error: "Invalid webhook signature",
                    message: error instanceof Error ? error.message : String(error),
                }),
                {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Check if already processed (early return for idempotency)
        const alreadyProcessed = await isEventProcessed(
            event.eventId,
            event.source
        );
        if (alreadyProcessed) {
            logger.info("Webhook event already processed, skipping", {
                eventId: event.eventId,
                source: event.source,
                eventType: event.eventType,
            });
            return new Response(
                JSON.stringify({
                    received: true,
                    message: "Event already processed",
                    eventId: event.eventId,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Find handler for event type
        const handler = config.handlers.get(event.eventType);
        if (!handler) {
            logger.warn("No handler found for webhook event type", {
                eventId: event.eventId,
                source: event.source,
                eventType: event.eventType,
            });

            // Record event as processed even if no handler (to prevent retries)
            await processWebhookWithIdempotency(event, async () => {
                // No-op handler
            });

            return new Response(
                JSON.stringify({
                    received: true,
                    message: "No handler for event type",
                    eventType: event.eventType,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Process webhook with idempotency
        const { processed } = await processWebhookWithIdempotency(
            event,
            async () => {
                await handler.handle(event);

                // Track metrics for Stripe webhooks
                if (event.source === "stripe") {
                    await trackStripeWebhook(event.eventType);
                }
            }
        );

        if (!processed) {
            return new Response(
                JSON.stringify({
                    received: true,
                    message: "Event already processed",
                    eventId: event.eventId,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        logger.info("Webhook event processed successfully", {
            eventId: event.eventId,
            source: event.source,
            eventType: event.eventType,
        });

        return new Response(
            JSON.stringify({
                received: true,
                eventId: event.eventId,
                eventType: event.eventType,
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        await handleError(error, "Webhook processing failed", {
            source: config.source,
            classification: "system",
        });

        return new Response(
            JSON.stringify({
                error: "Webhook processing failed",
                message: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}

