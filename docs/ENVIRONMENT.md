# Environment Variables Reference

Complete reference for all environment variables used in the application.

## Table of Contents

- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Development vs Production](#development-vs-production)
- [Security Notes](#security-notes)
- [Configuration Examples](#configuration-examples)

## Required Variables

### Application Environment

#### `NODE_ENV`

**Description**: Application environment mode

**Values**:

- `development` - Development mode (default)
- `production` - Production mode

**Example**:

```env
NODE_ENV=production
```

**Notes**:

- Affects logging, error handling, and cookie security
- Set to `production` in production deployments

#### `APP_URL`

**Description**: Your application's public-facing URL

**Example**:

```env
APP_URL=https://yourdomain.com
# or for development:
APP_URL=http://localhost:5173
```

**Used for**:

- Email redirects (password reset, email verification)
- Stripe checkout redirects
- OAuth callbacks

**Notes**:

- Must match your actual domain
- Include protocol (`http://` or `https://`)
- No trailing slash

### Database

#### `DATABASE_URL`

**Description**: PostgreSQL connection string

**Format**:

```
postgresql://user:password@host:port/database
```

**Example**:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/multi_tenant
```

**Used for**:

- Drizzle ORM database connections
- Database migrations
- All database queries

**Notes**:

- Keep this secret
- Use connection pooling in production (Supabase provides this)
- For Supabase: Use pooler URL for better performance

**Supabase Pooler URL**:

```
postgresql://user:password@host.pooler.supabase.com:6543/database?pgbouncer=true
```

### Supabase

#### `DATABASE_URL`

**Description**: Your Supabase project URL

**Example**:

```env
DATABASE_URL=https://your-project.supabase.co
```

**Where to find**: Supabase Dashboard → Settings → API → Project URL

#### `SUPABASE_PUBLISHABLE_KEY`

**Description**: Supabase anonymous (public) key

**Example**:

```env
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find**: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`

**Notes**:

- Safe to expose in client-side code
- Used for authentication

#### `SUPABASE_SECRET_KEY`

**Description**: Supabase secret key (service role key)

**Example**:

```env
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find**: Supabase Dashboard → Settings → API → Project API keys → `service_role` `secret`

**Notes**:

- ⚠️ **KEEP SECRET** - Never expose in client-side code
- Bypasses RLS policies
- Used for admin operations

### Session Security

#### `SESSION_SECRET`

**Description**: Secret key for encrypting session cookies

**Example**:

```env
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
```

**Requirements**:

- Minimum 32 characters
- Random, unpredictable string
- Different for each environment

**Generation**:

```bash
# Generate a secure random string
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Notes**:

- ⚠️ **KEEP SECRET**
- Change this in production
- Use different values for development and production

## Optional Variables

### Branding

#### `APP_NAME`

**Description**: Full application name (displayed in auth layout and other places)

**Default**: `"Multi-Tenant"`

**Example**:

```env
APP_NAME=My SaaS Application
```

#### `APP_SHORT_NAME`

**Description**: Short application name (displayed in headers, etc.)

**Default**: `APP_NAME` or `"App"`

**Example**:

```env
APP_SHORT_NAME=MyApp
```

### Stripe (Optional)

#### `STRIPE_SECRET_KEY`

**Description**: Stripe API secret key

**Example**:

```env
# Test mode
STRIPE_SECRET_KEY=sk_test_51...

# Production mode
STRIPE_SECRET_KEY=sk_live_51...
```

**Where to find**: Stripe Dashboard → Developers → API keys → Secret key

**Notes**:

- ⚠️ **KEEP SECRET**
- Use test keys for development
- Use live keys for production

#### `STRIPE_WEBHOOK_SECRET`

**Description**: Stripe webhook signing secret

**Example**:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Where to find**: Stripe Dashboard → Developers → Webhooks → Signing secret

**Notes**:

- ⚠️ **KEEP SECRET**
- Different for each webhook endpoint
- Used to verify webhook signatures

### Redis (Optional)

#### `REDIS_URL`

**Description**: Redis connection URL

**Example**:

```env
# Local Redis
REDIS_URL=redis://localhost:6379

# Redis Cloud
REDIS_URL=rediss://user:password@host:port

# Upstash
REDIS_URL=rediss://default:password@host:port
```

**Used for**:

- Rate limiting (if configured)
- Caching (if configured)

**Notes**:

- Optional - adapters fall back to in-memory if not set
- Use `rediss://` for TLS connections
- See [Production Adapters](ADAPTERS.md) for details

### Metrics (Optional)

#### `METRICS_ADAPTERS`

**Description**: Comma-separated list of metrics adapters to use

**Values**:

- `in-memory` - In-memory storage (default, for development)
- `prometheus` - Prometheus metrics (requires `prom-client` package)
- `otel` - OpenTelemetry metrics (requires `@opentelemetry/api` and `@opentelemetry/sdk-metrics` packages)

**Example**:

```env
# Single adapter (default)
METRICS_ADAPTERS=in-memory

# Prometheus for production
METRICS_ADAPTERS=prometheus

# Multiple adapters (for redundancy or different use cases)
METRICS_ADAPTERS=in-memory,prometheus

# OpenTelemetry
METRICS_ADAPTERS=otel
```

**Used for**:

- Request metrics (count, latency)
- Database query metrics
- Stripe API call metrics
- Custom business metrics

**Notes**:

- Defaults to `in-memory` if not set
- Multiple adapters can be configured (comma-separated)
- Failed adapters are skipped with warnings
- Always falls back to in-memory if all configured adapters fail
- See [Metrics Documentation](METRICS.md) for details

### Observability (Optional)

#### `SENTRY_DSN`

**Description**: Sentry DSN for error tracking

**Example**:

```env
SENTRY_DSN=https://your-key@sentry.io/project-id
```

**Notes**:

- Optional - Sentry integration disabled if not set
- See [Observability Documentation](OBSERVABILITY.md) for details

#### `SENTRY_ENVIRONMENT`

**Description**: Environment name for Sentry (e.g., "production", "staging")

**Example**:

```env
SENTRY_ENVIRONMENT=production
```

#### `HONEYCOMB_API_KEY`

**Description**: Honeycomb API key for distributed tracing

**Example**:

```env
HONEYCOMB_API_KEY=your-honeycomb-api-key
```

**Notes**:

- Requires `HONEYCOMB_DATASET` to be set
- See [Observability Documentation](OBSERVABILITY.md) for details

#### `HONEYCOMB_DATASET`

**Description**: Honeycomb dataset name

**Example**:

```env
HONEYCOMB_DATASET=multi-tenant-saas
```

#### `ROLLBAR_ACCESS_TOKEN`

**Description**: Rollbar access token for error tracking

**Example**:

```env
ROLLBAR_ACCESS_TOKEN=your-rollbar-access-token
```

**Notes**:

- Optional - Rollbar integration disabled if not set
- See [Observability Documentation](OBSERVABILITY.md) for details

#### `ROLLBAR_ENVIRONMENT`

**Description**: Environment name for Rollbar (e.g., "production", "staging")

**Example**:

```env
ROLLBAR_ENVIRONMENT=production
```

## Development vs Production

### Development

```env
NODE_ENV=development
APP_URL=http://localhost:5173
SESSION_SECRET=dev-secret-key-change-in-production
# ... other vars
```

**Notes**:

- Use test Stripe keys
- Use development Supabase project
- Less strict security settings

### Production

```env
NODE_ENV=production
APP_URL=https://yourdomain.com
SESSION_SECRET=<strong-random-32-char-string>
# ... other vars
```

**Notes**:

- Use production Stripe keys
- Use production Supabase project
- Strong secrets required
- HTTPS required
- Secure cookies enabled

## Security Notes

### Secrets (Never Commit)

These variables contain sensitive data and should **never** be committed to version control:

- `SESSION_SECRET`
- `DATABASE_URL`
- `SUPABASE_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REDIS_URL` (if contains password)

### Public Keys (Safe to Expose)

These can be exposed in client-side code:

- `DATABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

### Best Practices

1. **Use `.env.example`**: Commit example file, not actual `.env`
2. **Platform Secrets**: Use hosting platform's secret management
3. **Rotate Secrets**: Regularly rotate secrets in production
4. **Different Per Environment**: Use different values for dev/staging/prod
5. **Strong Secrets**: Use cryptographically secure random strings
6. **Limit Access**: Only grant access to secrets to necessary personnel

## Configuration Examples

### Minimal Setup (Development)

```env
NODE_ENV=development
APP_URL=http://localhost:5173
DATABASE_URL=postgresql://user:password@localhost:5432/multi_tenant
DATABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-secret-key
SESSION_SECRET=dev-secret-key-change-in-production

# Optional: Metrics
METRICS_ADAPTERS=in-memory
```

### Full Setup (Production)

```env
NODE_ENV=production
APP_URL=https://yourdomain.com
APP_NAME=My SaaS Application
APP_SHORT_NAME=MyApp

DATABASE_URL=postgresql://user:password@host.pooler.supabase.com:6543/database?pgbouncer=true

DATABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-production-anon-key
SUPABASE_SECRET_KEY=your-production-secret-key

SESSION_SECRET=<32-char-random-string>

STRIPE_SECRET_KEY=sk_live_your-production-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-production-webhook-secret

REDIS_URL=rediss://user:password@your-redis-host:6379

# Metrics (optional)
METRICS_ADAPTERS=in-memory,prometheus
```

### Supabase Setup

1. Create Supabase project
2. Go to Settings → API
3. Copy:
    - Project URL → `DATABASE_URL`
    - `anon` `public` key → `SUPABASE_PUBLISHABLE_KEY`
    - `service_role` `secret` key → `SUPABASE_SECRET_KEY`

### Stripe Setup

1. Create Stripe account
2. Go to Developers → API keys
3. Copy:
    - Secret key → `STRIPE_SECRET_KEY`
4. Go to Developers → Webhooks
5. Create webhook endpoint
6. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## Validation

The application validates required environment variables at startup. Missing required variables will cause the application to fail with clear error messages.

## Next Steps

- **[Quick Start](QUICK_START.md)**: Set up environment variables
- **[Deployment Guide](DEPLOYMENT.md)**: Configure for production
- **[Production Adapters](ADAPTERS.md)**: Set up Redis
