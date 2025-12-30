/**
 * Stripe Webhook Handlers
 *
 * Handlers for Stripe webhook events
 */

import Stripe from "stripe";
import { db } from "~/lib/db/index.server";
import { creditLedger } from "~/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { serverConfig } from "~/lib/config.server";
import type { WebhookEvent, WebhookHandler } from "../types.server";
import { logger } from "~/lib/logging.server";

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

async function lookupAccountIdByCustomer(
    customerId: string
): Promise<string | null> {
    const account = await db.query.accounts.findFirst({
        where: (accounts, { eq }) => eq(accounts.stripeCustomerId, customerId),
        columns: {
            id: true,
        },
    });
    return account?.id || null;
}

/**
 * Handler for checkout.session.completed event
 */
export class CheckoutSessionCompletedHandler implements WebhookHandler {
    async handle(event: WebhookEvent): Promise<void> {
        const stripeEvent = event.payload as Stripe.Event;
        const session = stripeEvent.data.object as Stripe.Checkout.Session;

        const stripe = getStripe();
        const lineItems = await stripe.checkout.sessions.listLineItems(
            session.id,
            { limit: 50 }
        );

        // Determine total minutes/claims to grant
        let grantMinutes = 0;
        let grantClaims = 0;

        for (const item of lineItems.data) {
            const price = item.price!;
            const qty = item.quantity ?? 1;

            // Option A: fixed packs via price metadata
            const md = price.metadata || {};
            if (md.minutes && md.claims) {
                grantMinutes += qty * Number(md.minutes);
                grantClaims += qty * Number(md.claims);
            } else {
                // Option B: custom top-up (e.g., $1 unit → convert to pools)
                const perDollarMinutes = 20;
                const perDollarClaims = 5;
                const units = qty; // each unit == $1
                grantMinutes += units * perDollarMinutes;
                grantClaims += units * perDollarClaims;
            }
        }

        // Account mapping: prefer session.metadata.accountId; else customer -> accounts table
        const accountId =
            session.metadata?.accountId ??
            (await lookupAccountIdByCustomer(session.customer as string));

        if (!accountId) {
            throw new Error(
                `Could not find account for customer ${session.customer}`
            );
        }

        // Atomic credit + ledger
        await db.transaction(async (tx) => {
            // ledger (idempotent by session id)
            await tx
                .insert(creditLedger)
                .values({
                    accountId,
                    pool: "minutes",
                    direction: "credit",
                    amount: grantMinutes,
                    reason: "topup",
                    stripeCheckoutSessionId: session.id,
                })
                .onConflictDoNothing();

            await tx
                .insert(creditLedger)
                .values({
                    accountId,
                    pool: "claims",
                    direction: "credit",
                    amount: grantClaims,
                    reason: "topup",
                    stripeCheckoutSessionId: session.id,
                })
                .onConflictDoNothing();

            // balances
            await tx.execute(sql`
                INSERT INTO credit_balances (account_id, minute_credits, claim_credits)
                VALUES (${accountId}, ${grantMinutes}, ${grantClaims})
                ON CONFLICT (account_id) DO UPDATE
                SET minute_credits = credit_balances.minute_credits + EXCLUDED.minute_credits,
                    claim_credits = credit_balances.claim_credits + EXCLUDED.claim_credits,
                    updated_at = now()
            `);
        });

        logger.info("Checkout session completed", {
            sessionId: session.id,
            accountId,
            grantMinutes,
            grantClaims,
        });
    }
}

/**
 * Handler for customer.subscription.updated event
 */
export class SubscriptionUpdatedHandler implements WebhookHandler {
    async handle(event: WebhookEvent): Promise<void> {
        const stripeEvent = event.payload as Stripe.Event;
        const subscription = stripeEvent.data.object as Stripe.Subscription;

        // Update subscription in database
        // TODO: Implement subscription update logic
        logger.info("Subscription updated", {
            subscriptionId: subscription.id,
            status: subscription.status,
        });
    }
}

/**
 * Handler for customer.subscription.deleted event
 */
export class SubscriptionDeletedHandler implements WebhookHandler {
    async handle(event: WebhookEvent): Promise<void> {
        const stripeEvent = event.payload as Stripe.Event;
        const subscription = stripeEvent.data.object as Stripe.Subscription;

        // Cancel subscription in database
        // TODO: Implement subscription cancellation logic
        logger.info("Subscription deleted", {
            subscriptionId: subscription.id,
        });
    }
}

/**
 * Get all Stripe webhook handlers
 */
export function getStripeHandlers(): Map<string, WebhookHandler> {
    const handlers = new Map<string, WebhookHandler>();
    handlers.set(
        "checkout.session.completed",
        new CheckoutSessionCompletedHandler()
    );
    handlers.set(
        "customer.subscription.updated",
        new SubscriptionUpdatedHandler()
    );
    handlers.set(
        "customer.subscription.deleted",
        new SubscriptionDeletedHandler()
    );
    return handlers;
}

