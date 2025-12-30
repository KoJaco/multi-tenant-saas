/**
 * Webhook Types
 *
 * Type definitions for webhook infrastructure
 */

export interface WebhookEvent {
    eventId: string;
    source: string;
    eventType: string;
    payload: unknown;
    metadata?: Record<string, unknown>;
    timestamp?: Date;
}

export interface WebhookHandler {
    /**
     * Handle a webhook event
     * @param event The webhook event
     * @returns Promise that resolves when handling is complete
     */
    handle(event: WebhookEvent): Promise<void>;
}

export interface WebhookVerifier {
    /**
     * Verify webhook signature/authenticity
     * @param request The incoming request
     * @param rawBody The raw request body
     * @returns Promise that resolves to the parsed event if valid, throws if invalid
     */
    verify(request: Request, rawBody: Buffer): Promise<WebhookEvent>;
}

export interface WebhookConfig {
    source: string;
    verifier: WebhookVerifier;
    handlers: Map<string, WebhookHandler>; // eventType -> handler
}

