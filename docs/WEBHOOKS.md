# Webhook Infrastructure

Unified webhook handling infrastructure with idempotency, signature verification, and error handling.

## Overview

The webhook infrastructure provides:
- **Unified handler pattern** for all webhook types
- **Idempotency** via `webhook_events` table
- **Signature verification** for security
- **Error handling** with retry tracking
- **Metrics tracking** for observability

## Architecture

```
┌─────────────┐
│   Webhook   │
│   Provider  │
└──────┬──────┘
       │ POST /webhooks/{source}
       ▼
┌─────────────────┐
│  Route Handler  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐     ┌──────────────────┐
│   Verifier      │────▶│ Signature Check  │
└──────┬──────────┘     └──────────────────┘
       │
       ▼
┌─────────────────┐     ┌──────────────────┐
│ Idempotency     │────▶│ Check if already │
│   Check         │     │    processed     │
└──────┬──────────┘     └──────────────────┘
       │
       ▼
┌─────────────────┐     ┌──────────────────┐
│   Handler       │────▶│ Process Event    │
│   Execution     │     │                   │
└──────┬──────────┘     └──────────────────┘
       │
       ▼
┌─────────────────┐
│ Mark Processed  │
└─────────────────┘
```

## Webhook Routes

### Stripe Webhooks

**Route**: `POST /webhooks/stripe`

**Verification**: Stripe signature verification using `STRIPE_WEBHOOK_SECRET`

**Supported Events**:
- `checkout.session.completed` - Process completed checkout
- `customer.subscription.updated` - Update subscription
- `customer.subscription.deleted` - Cancel subscription

**Example**:
```typescript
// Stripe sends webhook to:
POST https://yourdomain.com/webhooks/stripe
Headers:
  stripe-signature: t=1234567890,v1=...
Body: { "id": "evt_...", "type": "checkout.session.completed", ... }
```

### App Webhooks

**Route**: `POST /webhooks/app/*`

**Verification**: HMAC SHA-256 signature using `APP_WEBHOOK_SECRET`

**Example Routes**:
- `/webhooks/app/custom-service` - Custom service webhook
- `/webhooks/app/integration` - Integration webhook

**Example**:
```typescript
// Custom service sends webhook to:
POST https://yourdomain.com/webhooks/app/custom-service
Headers:
  x-webhook-signature: sha256=abc123...
Body: { "id": "evt_123", "type": "user.created", ... }
```

## Database Schema

### webhook_events Table

```sql
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (event_id, source)
);
```

**Key Features**:
- `event_id` + `source` unique constraint ensures idempotency
- `processed` flag tracks completion status
- `retry_count` tracks failed attempts
- `payload` stores full webhook data for debugging

## Configuration

### Environment Variables

```env
# Stripe Webhooks
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# App Webhooks
APP_WEBHOOK_SECRET=your-secret-key-for-hmac-signatures
```

### Generating APP_WEBHOOK_SECRET

```bash
# Generate a secure random secret
openssl rand -hex 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Creating Webhook Handlers

### Stripe Handler Example

```typescript
// app/lib/webhooks/handlers/stripe.server.ts
import type { WebhookEvent, WebhookHandler } from "../types.server";

export class CheckoutSessionCompletedHandler implements WebhookHandler {
    async handle(event: WebhookEvent): Promise<void> {
        const stripeEvent = event.payload as Stripe.Event;
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        
        // Your processing logic here
        // Idempotency is handled automatically
    }
}

// Register handler
export function getStripeHandlers(): Map<string, WebhookHandler> {
    const handlers = new Map<string, WebhookHandler>();
    handlers.set("checkout.session.completed", new CheckoutSessionCompletedHandler());
    return handlers;
}
```

### App Webhook Handler Example

```typescript
// app/routes/webhooks.app.custom-service.tsx
import type { WebhookHandler } from "~/lib/webhooks/types.server";
import { getAppWebhookHandlers } from "./webhooks.app.$";

class CustomServiceHandler implements WebhookHandler {
    async handle(event: WebhookEvent): Promise<void> {
        const payload = event.payload as { userId: string; action: string };
        
        // Your processing logic here
        console.log(`Processing ${payload.action} for user ${payload.userId}`);
    }
}

// Override getAppWebhookHandlers for this route
export function getAppWebhookHandlers(webhookPath: string) {
    if (webhookPath === "custom-service") {
        const handlers = new Map<string, WebhookHandler>();
        handlers.set("user.created", new CustomServiceHandler());
        return handlers;
    }
    return new Map();
}
```

## Idempotency

The webhook infrastructure ensures idempotency by:

1. **Recording events** before processing
2. **Checking if processed** before handling
3. **Marking as processed** after successful handling
4. **Tracking failures** for retry logic

### How It Works

```typescript
// 1. Webhook arrives
POST /webhooks/stripe
{ "id": "evt_123", "type": "checkout.session.completed" }

// 2. System checks webhook_events table
SELECT * FROM webhook_events 
WHERE event_id = 'evt_123' AND source = 'stripe'

// 3. If not found, insert record
INSERT INTO webhook_events (event_id, source, event_type, payload, processed)
VALUES ('evt_123', 'stripe', 'checkout.session.completed', {...}, false)

// 4. Process event
await handler.handle(event)

// 5. Mark as processed
UPDATE webhook_events 
SET processed = true, processed_at = now()
WHERE event_id = 'evt_123' AND source = 'stripe'
```

### Handling Duplicates

If the same webhook arrives twice:

1. First request: Processes normally
2. Second request: Detects existing record, returns early with `200 OK`

## Signature Verification

### Stripe Verification

Uses Stripe's official signature verification:

```typescript
stripe.webhooks.constructEvent(rawBody, signature, secret)
```

### App Webhook Verification

Uses HMAC SHA-256:

```typescript
const hmac = createHmac("sha256", secret);
hmac.update(rawBody);
const expectedSignature = hmac.digest("hex");
```

**Client-side example**:
```typescript
import crypto from "crypto";

const secret = "your-secret";
const payload = JSON.stringify({ id: "evt_123", type: "user.created" });
const hmac = crypto.createHmac("sha256", secret);
hmac.update(payload);
const signature = `sha256=${hmac.digest("hex")}`;

fetch("https://yourdomain.com/webhooks/app/custom-service", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
    },
    body: payload,
});
```

## Error Handling

### Failed Processing

If a webhook handler throws an error:

1. Error is logged
2. Event is marked as failed (not processed)
3. `retry_count` is incremented
4. Error is sent to observability services

### Retry Logic

Failed webhooks can be retried manually or via a background job:

```typescript
// Query failed webhooks
const failed = await db.query.webhookEvents.findMany({
    where: and(
        eq(webhookEvents.processed, false),
        eq(webhookEvents.error, null) // or specific error
    ),
});

// Retry processing
for (const event of failed) {
    await processWebhookWithIdempotency(event, async () => {
        const handler = getHandler(event.eventType);
        await handler.handle(event);
    });
}
```

## Monitoring

### Metrics

Webhooks automatically track metrics:
- `stripe_webhooks_total` - Count by event type
- Request duration tracking
- Error rate tracking

### Logging

All webhook events are logged with:
- Event ID
- Source
- Event type
- Processing status
- Request ID (for tracing)

### Observability

Failed webhooks are automatically sent to:
- Sentry (if configured)
- Honeycomb (if configured)
- Rollbar (if configured)

## Testing

### Local Testing with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5173/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed
```

### Testing App Webhooks

```typescript
// test-webhook.ts
import crypto from "crypto";

const secret = process.env.APP_WEBHOOK_SECRET!;
const payload = JSON.stringify({
    id: "test-123",
    type: "user.created",
    userId: "user_123",
});

const hmac = crypto.createHmac("sha256", secret);
hmac.update(payload);
const signature = `sha256=${hmac.digest("hex")}`;

fetch("http://localhost:5173/webhooks/app/test", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
    },
    body: payload,
});
```

## Best Practices

1. **Always verify signatures** - Never process unsigned webhooks
2. **Use idempotency** - Always check if event already processed
3. **Handle errors gracefully** - Log errors and mark events as failed
4. **Test thoroughly** - Use Stripe CLI or test tools
5. **Monitor failures** - Set up alerts for failed webhooks
6. **Keep secrets secure** - Never commit webhook secrets
7. **Use request IDs** - Include request IDs in webhook metadata for tracing

## Troubleshooting

### Signature Verification Failed

- Check webhook secret matches provider configuration
- Ensure raw body is used (not parsed JSON)
- Verify signature header format matches expected format

### Duplicate Processing

- Check `webhook_events` table for existing records
- Verify unique constraint on `(event_id, source)`
- Check idempotency logic is being called

### Events Not Processing

- Check handler is registered for event type
- Verify webhook route is correct
- Check logs for errors
- Verify database connection

## Migration

To add the `webhook_events` table:

```bash
# Run migration
npm run migrate

# Or manually
psql $DATABASE_URL -f migrations/add-webhook-events.sql
```

## Next Steps

- **[Stripe Integration](STRIPE.md)**: Stripe-specific webhook setup
- **[Observability](OBSERVABILITY.md)**: Error tracking and monitoring
- **[Metrics](METRICS.md)**: Webhook metrics tracking

