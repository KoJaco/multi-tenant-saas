# Observability and Operations Guide

Complete guide to observability features, error handling, logging, and health checks.

## Table of Contents

- [RequestID Tracking](#requestid-tracking)
- [Structured Logging](#structured-logging)
- [Error Handling](#error-handling)
- [Error Boundaries](#error-boundaries)
- [Health Checks](#health-checks)
- [Observability Integrations](#observability-integrations)

## RequestID Tracking

Every request automatically gets a unique requestID that is:
- Generated or extracted from `X-Request-ID` header
- Included in all log entries
- Added to response headers (`X-Request-ID`)
- Available throughout the request lifecycle via AsyncLocalStorage

### Usage

```typescript
import { getRequestId } from "~/lib/request-context.server";

// Get current request ID
const requestId = getRequestId();

// Use in logs (automatic)
logger.info("Operation completed", { userId: "123" });
// Logs include: { requestId: "...", userId: "123", ... }
```

### Propagating to External Services

**Stripe Webhooks:**
```typescript
import { addRequestIdToStripeMetadata } from "~/lib/stripe-helpers.server";

const checkoutSession = await stripe.checkout.sessions.create({
    // ... other params
    metadata: addRequestIdToStripeMetadata({
        userId: user.id,
        accountId: account.id,
    }),
});
```

**Background Jobs:**
```typescript
// Pass requestID as parameter
await processJob(jobData, { requestId: getRequestId() });
```

## Structured Logging

Enhanced logging with automatic requestID inclusion and structured output.

### Log Levels

- `trace` - Very detailed debugging (development only)
- `debug` - Debugging information (development only)
- `info` - General information
- `warn` - Warnings
- `error` - Errors
- `fatal` - Critical errors

### Usage

```typescript
import { logger, logRequest, logResponse } from "~/lib/logging.server";

// Basic logging
logger.info("User logged in", { userId: "123" });
logger.error("Failed to process payment", { orderId: "456" });

// Request/Response logging
logRequest(request);
logResponse(200, "/dashboard", 150); // status, path, durationMs
```

### Log Format

**Development:**
```
[INFO] [abc-123-def] User logged in { userId: "123" }
```

**Production (JSON):**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "message": "User logged in",
  "requestId": "abc-123-def",
  "userId": "123",
  "path": "/dashboard",
  "method": "GET"
}
```

## Error Handling

Centralized error handling with classification and observability integration.

### Error Classification

Errors are automatically classified as:
- **User errors** (4xx): Validation, authentication, authorization, not found
- **System errors** (5xx): Database, external APIs, unexpected errors

### Usage

```typescript
import { handleError, createErrorResponse, isUserError } from "~/lib/errors.server";

try {
    // Your code
} catch (error) {
    // Handle and log error
    await handleError(error, "Failed to process order", {
        orderId: "123",
        userId: user.id,
    });

    // Create user-friendly response
    if (isUserError(error)) {
        return createErrorResponse(error, "Invalid order data", 400);
    }
    
    return createErrorResponse(error, "An error occurred", 500);
}
```

### Error Response Format

```json
{
  "error": "User-friendly error message",
  "requestId": "abc-123-def",
  "code": "VALIDATION_ERROR" // optional
}
```

## Error Boundaries

### CatchBoundary

Handles HTTP errors (4xx, redirects):
- 404 - Page Not Found
- 403 - Access Denied
- 401 - Unauthorized
- 400 - Bad Request
- 500+ - Server Error

### ErrorBoundary

Handles unexpected errors (500):
- Catches rendering errors
- Logs and reports to observability services
- Shows user-friendly error page in production
- Shows detailed error in development

Both boundaries are automatically configured in `app/root.tsx`.

## Health Checks

### `/healthz` - Liveness Probe

Lightweight health check for load balancers:
- No database queries
- Fast response (< 10ms)
- Returns 200 OK if server is running

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### `/readyz` - Readiness Probe

Comprehensive readiness check:
- Database connection check
- Stripe API check (if configured)
- Redis connection check (if configured)
- Returns 200 if all checks pass, 503 if any fail

**Response:**
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "durationMs": 5 },
    "stripe": { "status": "ok", "durationMs": 120 },
    "redis": { "status": "not_configured" }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Observability Integrations

### Sentry

**Setup:**
1. Install: `npm install @sentry/remix`
2. Set environment variables:
   ```env
   SENTRY_DSN=https://your-sentry-dsn
   SENTRY_ENVIRONMENT=production
   ```
3. Initialize in `app/entry.server.tsx`:
   ```typescript
   import { initSentry } from "~/lib/observability/sentry.server";
   await initSentry();
   ```

**Features:**
- Automatic error capture
- RequestID in tags
- User context tracking
- Performance monitoring

### Honeycomb

**Setup:**
1. Install: `npm install libhoney`
2. Set environment variables:
   ```env
   HONEYCOMB_API_KEY=your-api-key
   HONEYCOMB_DATASET=your-dataset-name
   ```

**Usage:**
```typescript
import { startSpan } from "~/lib/observability/honeycomb.server";

await startSpan("process-order", async (span) => {
    span.addField("orderId", order.id);
    // Your code
});
```

### Rollbar

**Setup:**
1. Install: `npm install rollbar`
2. Set environment variables:
   ```env
   ROLLBAR_ACCESS_TOKEN=your-access-token
   ROLLBAR_ENVIRONMENT=production
   ```

**Features:**
- Automatic error reporting
- Custom data (requestID, user context)
- Error grouping and tracking

## Best Practices

1. **Always use structured logging** - Include relevant context
2. **Classify errors** - Use `handleError()` for proper classification
3. **Propagate requestID** - Include in external API calls and background jobs
4. **Monitor health checks** - Set up alerts on `/readyz` failures
5. **Use observability services** - Configure at least one service for production

## Troubleshooting

### RequestID not appearing in logs

Ensure you're using `withRequestContext()` in your loaders/actions:
```typescript
import { initRequestContext, withRequestContext } from "~/lib/request-context.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const context = initRequestContext(request);
    return withRequestContext(context, async () => {
        // Your code
    });
}
```

### Errors not being reported

Check that observability services are configured:
- Verify environment variables are set
- Check that packages are installed
- Review service-specific logs

### Health checks failing

- Check database connectivity
- Verify Stripe API key is valid
- Ensure Redis is accessible (if configured)
- Review error messages in `/readyz` response

