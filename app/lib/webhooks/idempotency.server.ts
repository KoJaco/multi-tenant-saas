/**
 * Webhook Idempotency
 *
 * Ensures webhooks are processed exactly once using the webhook_events table
 */

import { db } from "~/lib/db/index.server";
import { webhookEvents } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { WebhookEvent } from "./types.server";
import { logger } from "~/lib/logging.server";

/**
 * Check if a webhook event has already been processed
 */
export async function isEventProcessed(
    eventId: string,
    source: string
): Promise<boolean> {
    const existing = await db.query.webhookEvents.findFirst({
        where: and(
            eq(webhookEvents.eventId, eventId),
            eq(webhookEvents.source, source)
        ),
        columns: {
            processed: true,
        },
    });

    return existing?.processed ?? false;
}

/**
 * Record a webhook event (before processing)
 * Returns true if event was newly inserted, false if it already existed
 */
export async function recordWebhookEvent(
    event: WebhookEvent
): Promise<{ inserted: boolean; id: string }> {
    try {
        const result = await db
            .insert(webhookEvents)
            .values({
                eventId: event.eventId,
                source: event.source,
                eventType: event.eventType,
                payload: event.payload as any,
                metadata: event.metadata || {},
                processed: false,
            })
            .returning({ id: webhookEvents.id });

        return { inserted: true, id: result[0].id };
    } catch (error: any) {
        // Unique constraint violation means event already exists
        if (error.code === "23505") {
            const existing = await db.query.webhookEvents.findFirst({
                where: and(
                    eq(webhookEvents.eventId, event.eventId),
                    eq(webhookEvents.source, event.source)
                ),
                columns: {
                    id: true,
                    processed: true,
                },
            });

            if (existing) {
                return { inserted: false, id: existing.id };
            }
        }

        throw error;
    }
}

/**
 * Mark a webhook event as processed
 */
export async function markEventProcessed(
    eventId: string,
    source: string
): Promise<void> {
    await db
        .update(webhookEvents)
        .set({
            processed: true,
            processedAt: new Date(),
        })
        .where(
            and(
                eq(webhookEvents.eventId, eventId),
                eq(webhookEvents.source, source)
            )
        );
}

/**
 * Mark a webhook event as failed
 */
export async function markEventFailed(
    eventId: string,
    source: string,
    error: string
): Promise<void> {
    const existing = await db.query.webhookEvents.findFirst({
        where: and(
            eq(webhookEvents.eventId, eventId),
            eq(webhookEvents.source, source)
        ),
        columns: {
            retryCount: true,
        },
    });

    await db
        .update(webhookEvents)
        .set({
            error,
            retryCount: (existing?.retryCount || 0) + 1,
        })
        .where(
            and(
                eq(webhookEvents.eventId, eventId),
                eq(webhookEvents.source, source)
            )
        );
}

/**
 * Process webhook with idempotency
 * Returns true if event was processed, false if already processed
 */
export async function processWebhookWithIdempotency(
    event: WebhookEvent,
    handler: () => Promise<void>
): Promise<{ processed: boolean; alreadyProcessed: boolean }> {
    // Check if already processed
    if (await isEventProcessed(event.eventId, event.source)) {
        logger.info("Webhook event already processed", {
            eventId: event.eventId,
            source: event.source,
            eventType: event.eventType,
        });
        return { processed: false, alreadyProcessed: true };
    }

    // Record event (may already exist from a previous attempt)
    const { inserted } = await recordWebhookEvent(event);

    if (!inserted) {
        // Event was recorded but not processed - check if it's now processed
        if (await isEventProcessed(event.eventId, event.source)) {
            return { processed: false, alreadyProcessed: true };
        }
    }

    // Process the event
    try {
        await handler();
        await markEventProcessed(event.eventId, event.source);
        return { processed: true, alreadyProcessed: false };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        await markEventFailed(event.eventId, event.source, errorMessage);
        throw error;
    }
}

