# Deployment Guide

Complete guide to deploying your multi-tenant SaaS application to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deployment Platforms](#deployment-platforms)
- [Post-Deployment](#post-deployment)
- [Scaling Considerations](#scaling-considerations)

## Prerequisites

Before deploying, ensure you have:

1. **Production Database**: PostgreSQL database (Supabase recommended)
2. **Supabase Project**: Production Supabase project configured
3. **Stripe Account**: Production Stripe account (if using payments)
4. **Domain Name**: Custom domain (optional but recommended)
5. **SSL Certificate**: Usually provided by hosting platform

## Environment Setup

### Production Environment Variables

Set these in your hosting platform's environment variable settings:

```env
# Application
NODE_ENV=production
APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Supabase
DATABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-production-anon-key
SUPABASE_SECRET_KEY=your-production-secret-key

# Session Security
SESSION_SECRET=your-super-secret-production-key-min-32-chars

# Stripe (if using)
STRIPE_SECRET_KEY=sk_live_your-production-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-production-webhook-secret

# Redis (optional, for scaling)
REDIS_URL=redis://your-redis-host:6379

# Branding
APP_NAME=Your SaaS Name
APP_SHORT_NAME=YourApp
```

### Security Checklist

- [ ] Use strong, unique `SESSION_SECRET` (32+ characters)
- [ ] Never commit `.env` files to version control
- [ ] Use production Supabase keys (not development)
- [ ] Use production Stripe keys (not test keys)
- [ ] Enable HTTPS/SSL
- [ ] Set secure cookie flags in production
- [ ] Configure CORS properly
- [ ] Set up monitoring and error tracking

## Deployment Platforms

### Vercel

#### Setup

1. **Install Vercel CLI**:

    ```bash
    npm install -g vercel
    ```

2. **Deploy**:

    ```bash
    vercel --prod
    ```

3. **Configure Environment Variables**:
    - Go to Vercel Dashboard → Project → Settings → Environment Variables
    - Add all production environment variables

#### Configuration

Create `vercel.json`:

```json
{
    "buildCommand": "npm run build",
    "outputDirectory": "build/client",
    "framework": null,
    "installCommand": "npm install",
    "devCommand": "npm run dev",
    "rewrites": [
        {
            "source": "/(.*)",
            "destination": "/build/server/index.js"
        }
    ]
}
```

#### Notes

- Vercel automatically handles HTTPS
- Serverless functions have execution time limits
- Consider using Vercel's Edge Functions for better performance
- Database connections: Use connection pooling (Supabase provides this)

### Railway

#### Setup

1. **Install Railway CLI**:

    ```bash
    npm install -g @railway/cli
    ```

2. **Login**:

    ```bash
    railway login
    ```

3. **Initialize**:

    ```bash
    railway init
    ```

4. **Deploy**:
    ```bash
    railway up
    ```

#### Configuration

Railway auto-detects React Router projects. Configure:

1. **Environment Variables**: Railway Dashboard → Variables
2. **Database**: Add PostgreSQL service (or use external)
3. **Domain**: Railway Dashboard → Settings → Generate Domain

#### Notes

- Railway provides PostgreSQL databases
- Automatic HTTPS
- Easy Redis integration
- Good for full-stack apps

### Fly.io

#### Setup

1. **Install Fly CLI**:

    ```bash
    curl -L https://fly.io/install.sh | sh
    ```

2. **Login**:

    ```bash
    fly auth login
    ```

3. **Launch**:
    ```bash
    fly launch
    ```

#### Configuration

Create `fly.toml`:

```toml
app = "your-app-name"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"

[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 25
    soft_limit = 20
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "1s"
    interval = "15s"
    restart_limit = 0
    timeout = "2s"
```

#### Notes

- Global edge network
- Docker-based deployment
- Good for global applications
- Supports Redis

### Self-Hosted (Docker)

#### Dockerfile

```dockerfile
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 reactrouter
COPY --from=builder --chown=reactrouter:nodejs /app/build ./build
COPY --from=builder --chown=reactrouter:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=reactrouter:nodejs /app/package.json ./package.json
USER reactrouter
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build/server/index.js"]
```

#### docker-compose.yml

```yaml
version: "3.8"

services:
    app:
        build: .
        ports:
            - "3000:3000"
        environment:
            - NODE_ENV=production
            - DATABASE_URL=${DATABASE_URL}
            - DATABASE_URL=${DATABASE_URL}
            - SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
            - SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}
            - SESSION_SECRET=${SESSION_SECRET}
        env_file:
            - .env.production
        restart: unless-stopped

    redis:
        image: redis:7-alpine
        ports:
            - "6379:6379"
        restart: unless-stopped
```

#### Deployment

```bash
# Build
docker build -t your-app .

# Run
docker-compose up -d

# Or with docker run
docker run -p 3000:3000 --env-file .env.production your-app
```

## Post-Deployment

### 1. Run Database Migrations

```bash
# Via CLI or platform console
npm run migrate
# or
tsx app/lib/db/migrate.ts
```

### 2. Apply RLS Policies

```bash
# Via Supabase SQL Editor (recommended)
# Copy contents of scripts/apply-rls-policies.sql
# Paste and run in Supabase Dashboard → SQL Editor

# Or via psql
psql $DATABASE_URL -f scripts/apply-rls-policies.sql
```

### 3. Create Superuser

```bash
# Via platform console or SSH
tsx scripts/create-superuser.ts
```

**Never run seed script in production!**

### 4. Configure Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/webhooks/stripe`
3. Select events:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 5. Set Up Monitoring

#### Error Tracking

Consider integrating:

- **Sentry**: Error tracking and monitoring
- **LogRocket**: Session replay and error tracking
- **Datadog**: Application performance monitoring

#### Health Checks

Create a health check endpoint:

```typescript
// app/routes/health.tsx
export async function loader() {
    // Check database connection
    try {
        await db.query.accounts.findFirst();
    } catch (error) {
        return json(
            { status: "unhealthy", error: "Database connection failed" },
            { status: 503 }
        );
    }

    return json({ status: "healthy" });
}
```

### 6. Set Up Backups

- **Database**: Configure automated backups (Supabase provides this)
- **Files**: Backup any uploaded files (if applicable)
- **Environment Variables**: Store securely (use platform's secret management)

## Scaling Considerations

### Database Scaling

#### Connection Pooling

Use Supabase's connection pooling:

```env
# Use pooler URL instead of direct connection
DATABASE_URL=postgresql://user:password@host.pooler.supabase.com:6543/database?pgbouncer=true
```

#### Read Replicas

For read-heavy workloads:

- Set up read replicas
- Route read queries to replicas
- Keep writes on primary

### Redis for Scaling

#### When to Use Redis

- Multi-server deployments
- High traffic (> 1000 req/min)
- Need shared rate limiting
- Need shared caching

#### Setup Redis

1. **Choose Provider**:
    - Redis Cloud
    - Upstash
    - Railway Redis
    - Self-hosted

2. **Configure**:

    ```env
    REDIS_URL=redis://your-redis-host:6379
    ```

3. **Adapters Auto-Detect**: No code changes needed!

See [Production Adapters](ADAPTERS.md) for details.

### CDN for Static Assets

Configure CDN for:

- Static files (`/build/client/`)
- Images and media
- Fonts

Most platforms (Vercel, Railway) provide CDN automatically.

### Load Balancing

For high-traffic applications:

- Use platform's load balancer
- Ensure Redis adapters are configured
- Monitor server resources

### Performance Optimization

1. **Enable Caching**:
    - Cache permissions
    - Cache user data
    - Cache frequently accessed data

2. **Database Indexes**:
    - Ensure all foreign keys are indexed
    - Add indexes for common query patterns

3. **Query Optimization**:
    - Use Drizzle's query builder efficiently
    - Avoid N+1 queries
    - Use database views for complex queries

## Monitoring

### Key Metrics to Monitor

- **Response Times**: Average and p95 response times
- **Error Rates**: 4xx and 5xx error rates
- **Database Connections**: Active connections and pool usage
- **Rate Limiting**: Rate limit hits and blocks
- **Cache Hit Rates**: Cache effectiveness
- **Server Resources**: CPU, memory, disk usage

### Logging

Use structured logging:

```typescript
import { logger } from "~/lib/logging.server";

logger.info("User logged in", { userId, accountId });
logger.error("Database error", error, { query, params });
```

## Troubleshooting

### Database Connection Issues

- Check `DATABASE_URL` is correct
- Verify database is accessible from deployment platform
- Check connection pool limits
- Ensure RLS policies are applied

### Rate Limiting Not Working

- Verify Redis connection (if using Redis adapter)
- Check rate limit configuration
- Review rate limit logs

### Session Issues

- Verify `SESSION_SECRET` is set
- Check cookie settings (secure, httpOnly)
- Ensure domain matches deployment URL

### Stripe Webhook Issues

- Verify webhook secret matches
- Check webhook endpoint is accessible
- Review Stripe webhook logs
- Ensure endpoint handles all event types

## Next Steps

- **[Production Adapters](ADAPTERS.md)**: Set up Redis for scaling
- **[Environment Variables](ENVIRONMENT.md)**: Complete configuration reference
- **[Database Schema](DATABASE.md)**: Database management
