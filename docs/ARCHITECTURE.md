# Architecture Documentation

This document provides a comprehensive overview of the system architecture, design decisions, and how components interact.

## Table of Contents

- [Multi-Tenancy Model](#multi-tenancy-model)
- [Database Schema](#database-schema)
- [Authentication Flow](#authentication-flow)
- [RBAC System](#rbac-system)
- [Request Flow](#request-flow)
- [Security Architecture](#security-architecture)
- [Adapter Pattern](#adapter-pattern)

## Multi-Tenancy Model

### Type: Shared Database, Shared Schema

This template uses a **shared database, shared schema** approach:

- All tenants share the same PostgreSQL database
- All tenants use the same table structure (schema)
- Data isolation is achieved through `accountId` foreign keys
- Row-Level Security (RLS) policies enforce isolation at the database level

### Isolation Strategy

```mermaid
graph TB
    subgraph "Tenant Isolation"
        Account1[Account 1<br/>ID: uuid-1]
        Account2[Account 2<br/>ID: uuid-2]
        Account3[Account 3<br/>ID: uuid-3]
    end
    
    subgraph "Shared Database"
        UsersTable[users table<br/>accountId FK]
        RolesTable[roles table<br/>accountId FK]
        DataTable[All tenant data<br/>accountId FK]
    end
    
    subgraph "RLS Policies"
        Policy1[Filter: accountId = uuid-1]
        Policy2[Filter: accountId = uuid-2]
        Policy3[Filter: accountId = uuid-3]
    end
    
    Account1 -->|Can only access| Policy1
    Account2 -->|Can only access| Policy2
    Account3 -->|Can only access| Policy3
    
    Policy1 --> UsersTable
    Policy1 --> RolesTable
    Policy1 --> DataTable
    
    Policy2 --> UsersTable
    Policy2 --> RolesTable
    Policy2 --> DataTable
    
    Policy3 --> UsersTable
    Policy3 --> RolesTable
    Policy3 --> DataTable
    
    style Account1 fill:#ff6b6b
    style Account2 fill:#4ecdc4
    style Account3 fill:#95e1d3
    style Policy1 fill:#fff4e1
    style Policy2 fill:#fff4e1
    style Policy3 fill:#fff4e1
```

### Tenant Identification

Tenants are identified through the authenticated user's `accountId`:

1. User authenticates via Supabase
2. Application looks up user's `accountId` from `users` table
3. All queries are filtered by `accountId`
4. RLS policies enforce `accountId` filtering at database level

### Benefits

- **Cost-effective**: Single database instance serves all tenants
- **Easier maintenance**: Schema changes apply to all tenants
- **Better performance**: Shared connection pool, query optimization
- **Simpler backups**: Single database to backup

### Trade-offs

- **RLS complexity**: Requires careful RLS policy design
- **Schema flexibility**: All tenants share the same schema
- **Data privacy**: Requires strong RLS policies (provided)

## Database Schema

### Core Tables

```mermaid
erDiagram
    accounts ||--o{ users : has
    accounts ||--o{ roles : has
    accounts ||--o{ permissions : has
    accounts ||--o{ credit_balances : has
    accounts ||--o{ subscriptions : has
    
    users ||--o{ role_users : has
    roles ||--o{ role_users : has
    roles ||--o{ permission_roles : has
    permissions ||--o{ permission_roles : has
    
    accounts {
        uuid id PK
        text name
        text plan
        text stripe_customer_id
        text stripe_subscription_id
        timestamp created_at
    }
    
    users {
        uuid id PK
        uuid account_id FK
        text email
        text provider
        enum role
        boolean email_verified
    }
    
    roles {
        uuid id PK
        uuid account_id FK
        text name
        integer access_level
    }
    
    permissions {
        uuid id PK
        uuid account_id FK
        enum entity
        enum[] actions
        boolean is_owner_only
    }
    
    role_users {
        uuid user_id FK
        uuid role_id FK
        uuid assigned_by FK
    }
    
    permission_roles {
        uuid permission_id FK
        uuid role_id FK
    }
```

### Key Relationships

1. **Accounts → Users**: One-to-many (one account has many users)
2. **Accounts → Roles**: One-to-many (one account has many roles)
3. **Accounts → Permissions**: One-to-many (one account has many permissions)
4. **Users ↔ Roles**: Many-to-many (via `role_users` table)
5. **Roles ↔ Permissions**: Many-to-many (via `permission_roles` table)

### Row-Level Security (RLS)

RLS policies are applied to all tenant-scoped tables:

```sql
-- Example RLS policy for users table
CREATE POLICY "Users can only access their account's users"
ON users FOR ALL
USING (account_id = get_user_account_id());
```

The `get_user_account_id()` function:
- Extracts the authenticated user's ID from `auth.uid()`
- Looks up the user's `accountId` from the `users` table
- Returns the `accountId` for policy filtering

## Authentication Flow

### Signup Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase
    participant Database
    
    User->>App: Submit signup form
    App->>App: Validate input (Zod)
    App->>App: Check rate limit
    App->>App: Validate CSRF token
    App->>Supabase: Create auth user
    Supabase-->>App: User created
    App->>Database: Create account (transaction)
    App->>Database: Create user record
    App->>Database: Create default roles
    App->>Database: Create default permissions
    App->>Database: Assign owner role
    App->>Supabase: Send confirmation email
    Supabase-->>User: Confirmation email
    App-->>User: Redirect to verify email
```

### Login Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase
    participant Database
    
    User->>App: Submit login form
    App->>App: Validate input
    App->>App: Check rate limit
    App->>App: Validate CSRF token
    App->>Supabase: Sign in with email/password
    Supabase-->>App: Session + User
    App->>Database: Update last_login_at
    App->>Database: Get user + accountId
    App->>App: Set session cookie
    App-->>User: Redirect to dashboard
```

### Session Management

- Sessions are managed via Supabase Auth
- Session cookies are HttpOnly and secure (in production)
- Session data includes user ID, which is used to look up `accountId`
- Sessions are validated on every request

## RBAC System

### Role Hierarchy

```mermaid
graph TD
    Owner[Owner Role<br/>Access Level: 2<br/>Full Control]
    Admin[Admin Role<br/>Access Level: 1<br/>Management]
    User[User Role<br/>Access Level: 0<br/>Basic Access]
    
    Owner -->|Can manage| Admin
    Owner -->|Can manage| User
    Admin -->|Can manage| User
    
    Owner -->|Has all| Permissions[All Permissions]
    Admin -->|Has subset| Permissions
    User -->|Has limited| Permissions
    
    style Owner fill:#ff6b6b
    style Admin fill:#4ecdc4
    style User fill:#95e1d3
    style Permissions fill:#fff4e1
```

### Permission Model

Permissions are defined by:
- **Entity**: What resource (e.g., `users`, `roles`, `billing`)
- **Actions**: What operations (e.g., `create`, `retrieve`, `update`, `delete`)
- **Is Owner Only**: Whether only owners can have this permission

Example permissions:
- `users:create,retrieve,update,delete` - Full user management
- `roles:retrieve` - View roles only
- `billing:create,retrieve` - Create and view billing records

### Access Level Enforcement

Access levels prevent lower-level users from accessing higher-level data:

```typescript
// User with access level 1 cannot access data from access level 2
if (userAccessLevel < requiredAccessLevel) {
    throw new Error("Insufficient access level");
}
```

### Checking Permissions

```typescript
// Check if user has permission
const hasPermission = await hasPermission(
    userId,
    "users",
    "create"
);

// Get all user permissions
const permissions = await getUserPermissions(userId);

// Get manageable roles (based on access level)
const roles = await getManageableRoles(userId);
```

## Request Flow

### Complete Request Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant Route
    participant Auth
    participant CSRF
    participant RateLimit
    participant RBAC
    participant DB
    participant RLS
    
    Client->>Route: HTTP Request
    Route->>CSRF: Validate token (if POST/PUT/DELETE)
    CSRF-->>Route: Valid
    Route->>RateLimit: Check limit
    RateLimit-->>Route: Allowed
    Route->>Auth: Get current user
    Auth->>DB: Lookup user by session
    DB-->>Auth: User + accountId
    Auth-->>Route: User object
    Route->>RBAC: Check permission
    RBAC->>DB: Query user roles/permissions
    DB->>RLS: Apply RLS (filter by accountId)
    RLS-->>DB: Filtered results
    DB-->>RBAC: Roles + Permissions
    RBAC-->>Route: Permission result
    Route->>DB: Query data
    DB->>RLS: Apply RLS (filter by accountId)
    RLS-->>DB: Filtered results
    DB-->>Route: Data
    Route-->>Client: Response
```

### Route Structure

Routes are organized by feature:

- `_auth.*` - Authentication routes (login, signup, password reset)
- `_dash.*` - Dashboard routes (protected, require authentication)
- `_mkt.*` - Marketing site routes (public)
- `api.*` - API endpoints
- `webhooks.*` - Webhook handlers (Stripe, etc.)

### Loader vs Action

- **Loaders**: Run on GET requests, fetch data, return to component
- **Actions**: Run on POST/PUT/DELETE requests, mutate data, redirect

## Security Architecture

### Defense in Depth

```mermaid
graph TB
    subgraph "Layer 1: Network"
        HTTPS[HTTPS/TLS]
        RateLimit[Rate Limiting]
    end
    
    subgraph "Layer 2: Application"
        CSRF[CSRF Protection]
        Validation[Input Validation]
        Auth[Authentication]
    end
    
    subgraph "Layer 3: Authorization"
        RBAC[RBAC Checks]
        AccessLevel[Access Level Checks]
    end
    
    subgraph "Layer 4: Database"
        RLS[Row-Level Security]
        Constraints[Database Constraints]
    end
    
    HTTPS --> RateLimit
    RateLimit --> CSRF
    CSRF --> Validation
    Validation --> Auth
    Auth --> RBAC
    RBAC --> AccessLevel
    AccessLevel --> RLS
    RLS --> Constraints
    
    style HTTPS fill:#e1f5ff
    style RateLimit fill:#e1f5ff
    style CSRF fill:#fff4e1
    style Validation fill:#fff4e1
    style Auth fill:#fff4e1
    style RBAC fill:#ffe1f5
    style AccessLevel fill:#ffe1f5
    style RLS fill:#e1ffe1
    style Constraints fill:#e1ffe1
```

### Security Features

1. **CSRF Protection**: All forms include CSRF tokens
2. **Rate Limiting**: Configurable limits on auth endpoints
3. **Input Validation**: Zod schemas validate all inputs
4. **Secure Sessions**: HttpOnly, secure cookies
5. **RLS Policies**: Database-level tenant isolation
6. **Permission Checks**: Application-level authorization

## Adapter Pattern

The template uses an adapter pattern for production services:

```mermaid
graph TB
    subgraph "Application Code"
        App[Application]
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

### Benefits

- **Flexibility**: Switch implementations without changing application code
- **Testing**: Easy to mock adapters in tests
- **Scaling**: Start with in-memory, upgrade to Redis when needed

See [Adapters Documentation](ADAPTERS.md) for details.

## Performance Considerations

### Database

- **Indexes**: All foreign keys are indexed
- **Query Optimization**: Use Drizzle's query builder for efficient queries
- **Connection Pooling**: PostgreSQL connection pooling via `postgres` library

### Caching

- **Permissions**: Cache user permissions (via adapter)
- **Rate Limiting**: In-memory or Redis (via adapter)
- **Session Data**: Managed by Supabase

### Scaling

- **Horizontal Scaling**: Use Redis adapters for multi-server deployments
- **Database Scaling**: Consider read replicas for read-heavy workloads
- **CDN**: Use CDN for static assets

## Next Steps

- [Multi-Tenancy Guide](MULTI_TENANCY.md) - Deep dive into multi-tenancy
- [Authentication & Authorization](AUTH.md) - Auth system details
- [Database Schema](DATABASE.md) - Complete schema reference
- [Production Adapters](ADAPTERS.md) - Using Redis and other adapters

