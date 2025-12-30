/**
 * Stripe Webhook Verifier
 *
 * Verifies Stripe webhook signatures
 */

import Stripe from "stripe";
import { serverConfig } from "~/lib/config.server";
import type { WebhookEvent, WebhookVerifier } from "./types.server";
import { getRequestId } from "~/lib/request-context.server";

let stripe: Stripe | null = null;

function getStripe(): Stripe {
    if (!stripe) {
        if (!serverConfig.STRIPE_SECRET_KEY) {
            throw new Error("STRIPE_SECRET_KEY not configured");
        }
        stripe = new Stripe(serverConfig.STRIPE_SECRET_KEY, {
            apiVersion: "2025-08-27.basil",
        });
    }
    return stripe;
}

export class StripeWebhookVerifier implements WebhookVerifier {
    private endpointSecret: string;

    constructor(endpointSecret?: string) {
        this.endpointSecret =
            endpointSecret || serverConfig.STRIPE_WEBHOOK_SECRET || "";
        if (!this.endpointSecret) {
            throw new Error("STRIPE_WEBHOOK_SECRET not configured");
        }
    }

    async verify(request: Request, rawBody: Buffer): Promise<WebhookEvent> {
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
            throw new Error("Missing stripe-signature header");
        }

        const stripe = getStripe();
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                this.endpointSecret
            );
        } catch (error: any) {
            throw new Error(`Stripe signature verification failed: ${error.message}`);
        }

        return {
            eventId: event.id,
            source: "stripe",
            eventType: event.type,
            payload: event,
            metadata: {
                livemode: event.livemode,
                apiVersion: event.api_version,
                requestId: getRequestId(),
            },
            timestamp: new Date(event.created * 1000),
        };
    }
}

