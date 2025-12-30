# Stripe Integration Guide

Complete guide to integrating Stripe payments and subscriptions.

## Table of Contents

- [Setup](#setup)
- [Webhooks](#webhooks)
- [Subscription Management](#subscription-management)
- [Credit System](#credit-system)
- [Testing](#testing)

## Setup

### 1. Create Stripe Account

1. Sign up at [Stripe](https://stripe.com)
2. Complete account verification
3. Get your API keys

### 2. Get API Keys

**Test Mode** (Development):
1. Go to Stripe Dashboard → Developers → API keys
2. Copy **Secret key** → `STRIPE_SECRET_KEY=sk_test_...`
3. Use test mode for development

**Live Mode** (Production):
1. Toggle to **Live mode** in Stripe Dashboard
2. Copy **Secret key** → `STRIPE_SECRET_KEY=sk_live_...`
3. Use live mode for production

### 3. Configure Environment Variables

```env
# Development (Test Mode)
STRIPE_SECRET_KEY=sk_test_your-test-secret-key

# Production (Live Mode)
STRIPE_SECRET_KEY=sk_live_your-production-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### 4. Initialize Stripe Client

The Stripe client is initialized in route files:

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
});
```

## Webhooks

### Setup Webhook Endpoint

1. **Go to Stripe Dashboard** → Developers → Webhooks
2. **Click "Add endpoint"**
3. **Endpoint URL**: `https://yourdomain.com/webhooks/stripe`
4. **Select events to listen to**:
   - `checkout.session.completed` - Payment completed
   - `customer.subscription.updated` - Subscription changed
   - `customer.subscription.deleted` - Subscription canceled
   - `invoice.payment_succeeded` - Invoice paid
   - `invoice.payment_failed` - Payment failed

5. **Copy signing secret** → `STRIPE_WEBHOOK_SECRET=whsec_...`

### Webhook Handler

The webhook handler (`/webhooks/stripe`) verifies signatures and processes events:

```typescript
// app/routes/webhooks.stripe.tsx
export async function action({ request }: ActionFunctionArgs) {
    const rawBody = await buffer(request.body);
    const sig = request.headers.get("stripe-signature")!;
    
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
    );
    
    // Process event
    switch (event.type) {
        case "checkout.session.completed":
            // Handle completed checkout
            break;
        case "customer.subscription.updated":
            // Handle subscription update
            break;
        // ... other events
    }
    
    return json({ received: true });
}
```

### Webhook Security

- **Signature Verification**: All webhooks verify Stripe signatures
- **Idempotency**: Events are processed idempotently (no duplicate processing)
- **Error Handling**: Failed webhooks are logged and can be retried

### Testing Webhooks Locally

Use Stripe CLI to forward webhooks to localhost:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks
stripe listen --forward-to localhost:5173/webhooks/stripe
```

This will:
- Forward webhooks to your local server
- Display webhook signing secret (use this for `STRIPE_WEBHOOK_SECRET`)

## Subscription Management

### Creating a Subscription

Subscriptions are created via Stripe Checkout:

```typescript
// app/routes/api.billing.credit-checkout.tsx
const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard/account/billing?status=success`,
    cancel_url: `${process.env.APP_URL}/dashboard/account/billing?status=cancelled`,
    metadata: { accountId },
});
```

### Subscription Status

Subscription status is stored in `accounts.subscriptionStatus`:

- `active`: Active subscription
- `trialing`: In trial period
- `past_due`: Payment failed, retrying
- `canceled`: Subscription canceled
- `unpaid`: Payment failed, subscription ended

### Updating Subscriptions

Subscriptions are updated via webhooks:

```typescript
case "customer.subscription.updated":
    const subscription = event.data.object as Stripe.Subscription;
    await db
        .update(accounts)
        .set({
            subscriptionStatus: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        })
        .where(eq(accounts.stripeSubscriptionId, subscription.id));
    break;
```

### Canceling Subscriptions

Subscriptions can be canceled:

```typescript
await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
});
```

This sets `cancelAtPeriodEnd: true` and cancels at the end of the billing period.

## Credit System

### Credit Purchase Flow

1. **User selects credit pack** → Creates Stripe Checkout session
2. **User completes payment** → `checkout.session.completed` webhook
3. **Credits are granted** → Updated in `credit_balances` table
4. **Transaction logged** → Entry in `credit_ledger` table

### Credit Types

The system supports multiple credit types:

- **Minute Credits**: For time-based usage
- **Claim Credits**: For claim-based usage

### Granting Credits

```typescript
case "checkout.session.completed":
    const session = event.data.object as Stripe.Checkout.Session;
    const accountId = session.metadata.accountId;
    
    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    
    // Calculate credits to grant
    let grantMinutes = 0;
    let grantClaims = 0;
    
    for (const item of lineItems.data) {
        const price = item.price!;
        const metadata = price.metadata || {};
        
        if (metadata.minutes && metadata.claims) {
            grantMinutes += item.quantity! * Number(metadata.minutes);
            grantClaims += item.quantity! * Number(metadata.claims);
        }
    }
    
    // Update credit balance
    await db
        .insert(creditBalances)
        .values({
            accountId,
            minuteCredits: grantMinutes,
            claimCredits: grantClaims,
        })
        .onConflictDoUpdate({
            target: creditBalances.accountId,
            set: {
                minuteCredits: sql`${creditBalances.minuteCredits} + ${grantMinutes}`,
                claimCredits: sql`${creditBalances.claimCredits} + ${grantClaims}`,
            },
        });
    
    // Log transaction
    await db.insert(creditLedger).values({
        accountId,
        amount: session.amount_total! / 100, // Convert from cents
        currency: session.currency!,
        description: `Credit purchase: ${grantMinutes} minutes, ${grantClaims} claims`,
        reference: session.id,
    });
    break;
```

### Using Credits

Deduct credits when used:

```typescript
// Deduct credits
await db
    .update(creditBalances)
    .set({
        minuteCredits: sql`${creditBalances.minuteCredits} - ${minutesUsed}`,
        claimCredits: sql`${creditBalances.claimCredits} - ${claimsUsed}`,
    })
    .where(eq(creditBalances.accountId, accountId));

// Log usage
await db.insert(creditLedger).values({
    accountId,
    amount: -minutesUsed, // Negative for usage
    currency: "credits",
    description: `Used ${minutesUsed} minutes`,
});
```

## Testing

### Test Mode

Use Stripe test mode for development:

1. **Use test API keys**: `sk_test_...`
2. **Use test cards**: See [Stripe test cards](https://stripe.com/docs/testing)
3. **Test webhooks**: Use Stripe CLI

### Test Cards

Common test cards:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0027 6000 3184`

### Testing Webhooks

1. **Use Stripe CLI**:
   ```bash
   stripe listen --forward-to localhost:5173/webhooks/stripe
   ```

2. **Trigger test events**:
   ```bash
   stripe trigger checkout.session.completed
   ```

3. **Check webhook logs**: Stripe Dashboard → Developers → Webhooks → Logs

### Testing Subscriptions

1. **Create test subscription**:
   ```bash
   stripe subscriptions create \
     --customer cus_test \
     --items[0][price]=price_test
   ```

2. **Update subscription**:
   ```bash
   stripe subscriptions update sub_test --cancel_at_period_end=true
   ```

3. **Verify in database**: Check `accounts` table for subscription status

## Best Practices

### Idempotency

Always make webhook handlers idempotent:

```typescript
// Check if already processed
const existing = await db.query.stripeWebhookEvents.findFirst({
    where: eq(stripeWebhookEvents.stripeId, event.id),
});

if (existing?.processed) {
    return json({ received: true }); // Already processed
}

// Process event
// ...

// Mark as processed
await db.insert(stripeWebhookEvents).values({
    stripeId: event.id,
    type: event.type,
    data: event.data,
    processed: true,
});
```

### Error Handling

Handle webhook errors gracefully:

```typescript
try {
    // Process webhook
} catch (error) {
    // Log error
    logger.error("Webhook processing failed", error, { eventId: event.id });
    
    // Return error to Stripe (will retry)
    return json({ error: "Processing failed" }, { status: 500 });
}
```

### Security

- **Verify Signatures**: Always verify webhook signatures
- **Use HTTPS**: Webhook endpoints must use HTTPS in production
- **Store Secrets Securely**: Never commit Stripe secrets to version control
- **Rotate Keys**: Regularly rotate API keys

## Next Steps

- **[Deployment Guide](DEPLOYMENT.md)**: Configure Stripe for production
- **[API Reference](API.md)**: Stripe API endpoints
- **[Environment Variables](ENVIRONMENT.md)**: Stripe configuration

