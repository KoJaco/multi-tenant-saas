/**
 * Stripe Webhook Handler
 *
 * Unified webhook handler for Stripe events with idempotency
 */

import { type ActionFunctionArgs } from "react-router";
import { processWebhook } from "~/lib/webhooks/handler.server";
import { StripeWebhookVerifier } from "~/lib/webhooks/stripe.server";
import { getStripeHandlers } from "~/lib/webhooks/handlers/stripe.server";
import { initRequestContext, withRequestContext } from "~/lib/request-context.server";

export async function action({ request }: ActionFunctionArgs) {
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        const verifier = new StripeWebhookVerifier();
        const handlers = getStripeHandlers();

        return processWebhook(request, {
            verifier,
            handlers,
            source: "stripe",
        });
    });
}
