# Production Adapters

Guide to using production-grade adapters for scaling your application.

## Table of Contents

- [Overview](#overview)
- [Rate Limiting Adapter](#rate-limiting-adapter)
- [Cache Adapter](#cache-adapter)
- [Migration Guide](#migration-guide)
- [Configuration](#configuration)

## Overview

The template uses an adapter pattern for production services, allowing you to:

- **Start Simple**: Use in-memory adapters for development
- **Scale Easily**: Switch to Redis adapters for production
- **Test Flexibly**: Mock adapters in tests

### Adapter Pattern

```mermaid
graph TB
    subgraph "Application Code"
        App[Your Application]
    end
    
    subgraph "Adapter Interface"
        Interface[RateLimitAdapter<br/>CacheAdapter]
    end
    
    subgraph "Implementations"
        InMemory[InMemoryAdapter<br/>Development]
        Redis[RedisAdapter<br/>Production]
    end
    
    App --> Interface
    Interface --> InMemory
    Interface --> Redis
    
    style Interface fill:#fff4e1
    style InMemory fill:#e1f5ff
    style Redis fill:#ffe1f5
```

## Rate Limiting Adapter

### When to Use Each Implementation

#### In-Memory Adapter (Default)

**Use when:**
- Development environment
- Single-server deployment
- Low traffic (< 1000 requests/minute)

**Limitations:**
- Not shared across servers
- Lost on server restart
- Memory usage grows with traffic

#### Redis Adapter

**Use when:**
- Production environment
- Multi-server deployment
- High traffic (> 1000 requests/minute)
- Need persistent rate limiting

**Benefits:**
- Shared across all servers
- Persistent across restarts
- Better performance at scale

### Usage

#### Basic Usage (Automatic)

The adapter is selected automatically based on `REDIS_URL`:

```typescript
import { checkRateLimit, rateLimitPresets } from "~/lib/rate-limit.server";

// Automatically uses Redis if REDIS_URL is set, otherwise in-memory
const result = await checkRateLimit(request, rateLimitPresets.login);

if (!result.allowed) {
    return json({ error: "Too many requests" }, { status: 429 });
}
```

#### Manual Configuration

```typescript
import {
    setRateLimitAdapter,
    RedisRateLimitAdapter,
    InMemoryRateLimitAdapter,
} from "~/lib/adapters/rate-limit";
import Redis from "ioredis";

// Use Redis adapter
const redis = new Redis(process.env.REDIS_URL);
const adapter = new RedisRateLimitAdapter(redis);
setRateLimitAdapter(adapter);

// Or use in-memory adapter
const adapter = new InMemoryRateLimitAdapter();
setRateLimitAdapter(adapter);
```

### Rate Limit Presets

Pre-configured presets for common endpoints:

```typescript
export const rateLimitPresets = {
    login: {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
    },
    signup: {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
    },
    passwordReset: {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
    },
    resendConfirmation: {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
    },
    general: {
        maxRequests: 20,
        windowMs: 60 * 1000, // 1 minute
    },
};
```

### Custom Rate Limits

```typescript
const result = await checkRateLimit(request, {
    maxRequests: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
    identifier: "custom-key", // Optional: custom identifier
});
```

## Cache Adapter

### When to Use Each Implementation

#### In-Memory Cache (Default)

**Use when:**
- Development environment
- Single-server deployment
- Cache can be lost on restart

**Limitations:**
- Not shared across servers
- Lost on server restart
- Memory usage grows with cached data

#### Redis Cache

**Use when:**
- Production environment
- Multi-server deployment
- Need shared cache across servers
- Want persistent cache

**Benefits:**
- Shared across all servers
- Persistent across restarts
- Better performance at scale
- Can set TTL per key

### Usage

#### Basic Usage (Automatic)

```typescript
import { getCacheAdapter } from "~/lib/adapters/cache";

const cache = getCacheAdapter();

// Get from cache
const cached = await cache.get<string>("user:123");
if (cached) {
    return cached;
}

// Set in cache (TTL: 1 hour)
await cache.set("user:123", userData, { ttl: 3600 });

// Check if exists
const exists = await cache.has("user:123");

// Delete from cache
await cache.delete("user:123");
```

#### Caching Permissions

```typescript
import { getCacheAdapter } from "~/lib/adapters/cache";
import { getUserPermissions } from "~/lib/permissions.server";

async function getCachedPermissions(userId: string) {
    const cache = getCacheAdapter();
    const cacheKey = `permissions:${userId}`;

    // Try cache first
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) {
        return cached;
    }

    // Fetch from database
    const permissions = await getUserPermissions(userId);

    // Cache for 1 hour
    await cache.set(cacheKey, permissions, { ttl: 3600 });

    return permissions;
}
```

#### Caching User Data

```typescript
import { getCacheAdapter } from "~/lib/adapters/cache";
import { db } from "~/lib/db/index.server";
import { users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

async function getCachedUser(userId: string) {
    const cache = getCacheAdapter();
    const cacheKey = `user:${userId}`;

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    // Fetch from database
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (user) {
        // Cache for 30 minutes
        await cache.set(cacheKey, user, { ttl: 1800 });
    }

    return user;
}
```

#### Manual Configuration

```typescript
import {
    setCacheAdapter,
    RedisCacheAdapter,
    InMemoryCacheAdapter,
} from "~/lib/adapters/cache";
import Redis from "ioredis";

// Use Redis adapter
const redis = new Redis(process.env.REDIS_URL);
const adapter = new RedisCacheAdapter(redis, "myapp:"); // Optional prefix
setCacheAdapter(adapter);

// Or use in-memory adapter
const adapter = new InMemoryCacheAdapter();
setCacheAdapter(adapter);
```

## Migration Guide

### Migrating from In-Memory to Redis

#### 1. Install Dependencies

```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

#### 2. Set Environment Variable

```env
REDIS_URL=redis://localhost:6379
# Or for Redis Cloud/Upstash:
REDIS_URL=rediss://user:password@host:port
```

#### 3. Adapters Auto-Detect Redis

The adapters automatically use Redis if `REDIS_URL` is set. No code changes needed!

#### 4. Verify Redis Connection

```typescript
// In your app initialization
import { getRateLimitAdapter, getCacheAdapter } from "~/lib/adapters";

const rateLimitAdapter = getRateLimitAdapter();
const cacheAdapter = getCacheAdapter();

// Test connection
await cacheAdapter.set("test", "value");
const value = await cacheAdapter.get("test");
console.log("Redis connected:", value === "value");
```

### Manual Migration

If you want explicit control:

```typescript
// app/lib/adapters.config.ts
import Redis from "ioredis";
import {
    setRateLimitAdapter,
    RedisRateLimitAdapter,
} from "~/lib/adapters/rate-limit";
import {
    setCacheAdapter,
    RedisCacheAdapter,
} from "~/lib/adapters/cache";

if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL);

    // Configure rate limiting
    setRateLimitAdapter(new RedisRateLimitAdapter(redis));

    // Configure caching
    setCacheAdapter(new RedisCacheAdapter(redis, "myapp:"));
}
```

Then import this file early in your application:

```typescript
// app/entry.server.tsx or similar
import "./lib/adapters.config";
```

## Configuration

### Environment Variables

```env
# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379

# For Redis Cloud/Upstash:
REDIS_URL=rediss://user:password@host:port
```

### Redis Providers

#### Redis Cloud

1. Sign up at [Redis Cloud](https://redis.com/try-free/)
2. Create a database
3. Copy the connection URL
4. Set `REDIS_URL` environment variable

#### Upstash

1. Sign up at [Upstash](https://upstash.com/)
2. Create a Redis database
3. Copy the REST URL or Redis URL
4. Set `REDIS_URL` environment variable

#### Self-Hosted

1. Install Redis: `brew install redis` (macOS) or `apt-get install redis` (Linux)
2. Start Redis: `redis-server`
3. Set `REDIS_URL=redis://localhost:6379`

### Performance Considerations

#### Rate Limiting

- **In-Memory**: Fast for single server, but not shared
- **Redis**: Slightly slower, but shared across servers
- **Recommendation**: Use Redis for production multi-server deployments

#### Caching

- **In-Memory**: Very fast, but limited by server memory
- **Redis**: Fast, shared, persistent
- **Recommendation**: Use Redis for production

#### TTL Settings

Choose appropriate TTLs based on data freshness needs:

```typescript
// Frequently changing data: short TTL
await cache.set("user:123", userData, { ttl: 300 }); // 5 minutes

// Stable data: longer TTL
await cache.set("permissions:123", permissions, { ttl: 3600 }); // 1 hour

// Very stable data: very long TTL
await cache.set("config:app", config, { ttl: 86400 }); // 24 hours
```

## Best Practices

### Cache Keys

Use consistent, namespaced cache keys:

```typescript
// ✅ Good
`user:${userId}`
`permissions:${userId}`
`account:${accountId}:users`

// ❌ Bad
`user123` // No namespace
`${userId}` // Too generic
```

### Cache Invalidation

Invalidate cache when data changes:

```typescript
// Update user
await db.update(users).set({ name: "New Name" }).where(eq(users.id, userId));

// Invalidate cache
const cache = getCacheAdapter();
await cache.delete(`user:${userId}`);
```

### Error Handling

Handle cache errors gracefully:

```typescript
try {
    const cached = await cache.get(key);
    if (cached) return cached;
} catch (error) {
    // Log error but continue to database
    console.error("Cache error:", error);
}

// Fallback to database
const data = await fetchFromDatabase();
```

### Testing

Mock adapters in tests:

```typescript
import { setCacheAdapter, InMemoryCacheAdapter } from "~/lib/adapters/cache";

beforeEach(() => {
    // Use in-memory adapter for tests
    setCacheAdapter(new InMemoryCacheAdapter());
});
```

## Next Steps

- **[Deployment Guide](DEPLOYMENT.md)**: Deploy with Redis
- **[Architecture](ARCHITECTURE.md)**: System architecture
- **[Environment Variables](ENVIRONMENT.md)**: Configuration reference

