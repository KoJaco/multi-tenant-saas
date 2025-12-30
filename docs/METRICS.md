# Metrics System

A pluggable metrics system supporting Prometheus, OpenTelemetry, and in-memory adapters.

## Overview

The metrics system provides:
- **Request metrics**: Count, latency, status codes
- **Database metrics**: Query count, duration, errors
- **Stripe metrics**: API call count, duration, errors
- **Custom metrics**: Counters, gauges, histograms, timers

## Configuration

Set the `METRICS_ADAPTER` environment variable:

```env
# In-memory (default, for development)
METRICS_ADAPTER=in-memory

# Prometheus (for production)
METRICS_ADAPTER=prometheus

# OpenTelemetry
METRICS_ADAPTER=otel
```

## Adapters

### In-Memory Adapter (Default)

No setup required. Metrics are stored in memory and reset on restart.

**Use for**: Development, testing

### Prometheus Adapter

**Setup:**
1. Install: `npm install prom-client`
2. Set: `METRICS_ADAPTER=prometheus`
3. Metrics available at `/metrics` endpoint

**Use for**: Production deployments with Prometheus

**Example Prometheus config:**
```yaml
scrape_configs:
  - job_name: 'multi-tenant-saas'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
```

### OpenTelemetry Adapter

**Setup:**
1. Install: `npm install @opentelemetry/api @opentelemetry/sdk-metrics`
2. Set: `METRICS_ADAPTER=otel`
3. Configure OTEL exporter (e.g., OTLP endpoint)

**Use for**: Production deployments with OpenTelemetry collector

## Usage

### Request Metrics

Request metrics are automatically tracked by middleware:

```typescript
import { withRequestMiddleware } from "~/lib/middleware.server";

export const loader = withRequestMiddleware(async ({ request }) => {
    // Request count and duration automatically tracked
    return json({ data: "..." });
});
```

**Tracked metrics:**
- `http_requests_total` - Request count by method, path, status
- `http_request_duration_ms` - Request latency by method, path, status

### Database Metrics

Wrap database operations with tracking helpers:

```typescript
import { db } from "~/lib/db/index.server";
import { trackDbSelect, trackDbInsert } from "~/lib/db/metrics.server";
import { accounts } from "~/lib/db/schema";

// Select query
const account = await trackDbSelect("accounts", async () => {
    return await db.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
    });
});

// Insert query
const newAccount = await trackDbInsert("accounts", async () => {
    return await db.insert(accounts).values({ ... }).returning();
});
```

**Tracked metrics:**
- `db_queries_total` - Query count by operation, table, status
- `db_query_duration_ms` - Query duration by operation, table

### Stripe Metrics

Wrap Stripe API calls with tracking helpers:

```typescript
import Stripe from "stripe";
import { trackStripeCall } from "~/lib/stripe/metrics.server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Track API call
const session = await trackStripeCall(
    "checkout.sessions",
    "create",
    async () => {
        return await stripe.checkout.sessions.create({
            mode: "payment",
            // ...
        });
    }
);

// Track webhook
import { trackStripeWebhook } from "~/lib/stripe/metrics.server";
await trackStripeWebhook(event.type);
```

**Tracked metrics:**
- `stripe_api_calls_total` - API call count by operation, resource, method, status
- `stripe_api_call_duration_ms` - API call duration by operation
- `stripe_webhooks_total` - Webhook count by event type

### Custom Metrics

Use the metrics helper functions directly:

```typescript
import {
    incrementCounter,
    recordGauge,
    recordHistogram,
    recordTimer,
    time,
} from "~/lib/metrics.server";

// Counter (increment)
await incrementCounter("orders_created_total", { account_id: accountId });

// Gauge (set value)
await recordGauge("active_sessions", sessionCount, { account_id: accountId });

// Histogram (distribution)
await recordHistogram("order_value", orderAmount, { currency: "usd" });

// Timer (duration)
await recordTimer("processing_time_ms", duration, { operation: "import" });

// Time an async operation
const result = await time("data_processing", async () => {
    return await processData();
}, { source: "csv" });
```

## Predefined Metric Names

Use constants from `METRIC_NAMES` for consistency:

```typescript
import { METRIC_NAMES, incrementCounter } from "~/lib/metrics.server";

await incrementCounter(METRIC_NAMES.HTTP_REQUEST_COUNT, {
    method: "GET",
    path: "/api/users",
});
```

Available metrics:
- `HTTP_REQUEST_COUNT` - HTTP request count
- `HTTP_REQUEST_DURATION` - HTTP request duration
- `DB_QUERY_COUNT` - Database query count
- `DB_QUERY_DURATION` - Database query duration
- `STRIPE_API_CALL_COUNT` - Stripe API call count
- `STRIPE_API_CALL_DURATION` - Stripe API call duration
- `STRIPE_WEBHOOK_COUNT` - Stripe webhook count
- `AUTH_LOGIN_COUNT` - Authentication login count
- And more...

## Metrics Endpoint

When using Prometheus adapter, metrics are available at `/metrics`:

```bash
curl http://localhost:3000/metrics
```

Response format (Prometheus):
```
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/users",status="200"} 42
http_requests_total{method="POST",path="/api/users",status="201"} 10

# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{method="GET",path="/api/users",le="100"} 30
http_request_duration_ms_bucket{method="GET",path="/api/users",le="500"} 40
http_request_duration_ms_bucket{method="GET",path="/api/users",le="+Inf"} 42
http_request_duration_ms_sum{method="GET",path="/api/users"} 1250
http_request_duration_ms_count{method="GET",path="/api/users"} 42
```

## Best Practices

1. **Use consistent labels**: Always include relevant context (account_id, user_id, etc.)
2. **Don't over-instrument**: Focus on business-critical operations
3. **Use predefined names**: Use `METRIC_NAMES` constants for consistency
4. **Label cardinality**: Avoid high-cardinality labels (e.g., user IDs) in production
5. **Error tracking**: Always track error status separately

## Examples

### Tracking Auth Events

```typescript
import { incrementCounter, METRIC_NAMES } from "~/lib/metrics.server";

// On login
await incrementCounter(METRIC_NAMES.AUTH_LOGIN_COUNT, {
    method: "email",
});

// On logout
await incrementCounter(METRIC_NAMES.AUTH_LOGOUT_COUNT);
```

### Tracking Business Events

```typescript
import { incrementCounter, METRIC_NAMES } from "~/lib/metrics.server";

// Account created
await incrementCounter(METRIC_NAMES.ACCOUNT_CREATED);

// User created
await incrementCounter(METRIC_NAMES.USER_CREATED, {
    account_id: accountId,
});

// Subscription created
await incrementCounter(METRIC_NAMES.SUBSCRIPTION_CREATED, {
    plan: planId,
    account_id: accountId,
});
```

### Tracking Custom Operations

```typescript
import { time, incrementCounter } from "~/lib/metrics.server";

const result = await time("file_upload", async () => {
    return await uploadFile(file);
}, {
    file_type: file.type,
    account_id: accountId,
});

await incrementCounter("files_uploaded_total", {
    file_type: file.type,
    account_id: accountId,
});
```

## Troubleshooting

### Metrics not appearing

1. Check adapter is initialized: `METRICS_ADAPTER` is set correctly
2. For Prometheus: Ensure `prom-client` is installed
3. For OTEL: Ensure `@opentelemetry/api` is installed
4. Check metrics endpoint: `/metrics` returns data

### High memory usage

- In-memory adapter stores all metrics in memory
- Switch to Prometheus or OTEL for production
- Consider metric retention policies

### Missing metrics

- Ensure operations are wrapped with tracking helpers
- Check labels are consistent (case-sensitive)
- Verify adapter is initialized before use

