/**
 * App Webhook Verifier
 *
 * Verifies app webhooks using HMAC signature
 */

import { createHmac, timingSafeEqual } from "crypto";
import { serverConfig } from "~/lib/config.server";
import type { WebhookEvent, WebhookVerifier } from "./types.server";
import { getRequestId } from "~/lib/request-context.server";

export class AppWebhookVerifier implements WebhookVerifier {
    private secret: string;

    constructor(secret?: string) {
        this.secret = secret || serverConfig.APP_WEBHOOK_SECRET || "";
        if (!this.secret) {
            throw new Error("APP_WEBHOOK_SECRET not configured");
        }
    }

    async verify(request: Request, rawBody: Buffer): Promise<WebhookEvent> {
        const signature = request.headers.get("x-webhook-signature");
        if (!signature) {
            throw new Error("Missing x-webhook-signature header");
        }

        // Verify HMAC signature
        const hmac = createHmac("sha256", this.secret);
        hmac.update(rawBody);
        const expectedSignature = hmac.digest("hex");
        const providedSignature = signature.replace("sha256=", "");

        // Use timing-safe comparison to prevent timing attacks
        if (
            expectedSignature.length !== providedSignature.length ||
            !timingSafeEqual(
                Buffer.from(expectedSignature),
                Buffer.from(providedSignature)
            )
        ) {
            throw new Error("Invalid webhook signature");
        }

        // Parse JSON payload
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody.toString("utf-8"));
        } catch (error) {
            throw new Error("Invalid JSON payload");
        }

        // Extract event ID and type from payload
        const eventId =
            (payload as any)?.id ||
            (payload as any)?.eventId ||
            `app-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const eventType =
            (payload as any)?.type ||
            (payload as any)?.eventType ||
            "unknown";

        return {
            eventId,
            source: "app",
            eventType,
            payload,
            metadata: {
                requestId: getRequestId(),
                timestamp: new Date().toISOString(),
            },
            timestamp: new Date(),
        };
    }
}

