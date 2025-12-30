# Compliance & Data Governance

This document outlines compliance and data governance patterns used in the application.

## Data Retention

The application supports configurable data retention policies for different types of data:

### Configuration

Set these environment variables to configure retention periods (in days):

```bash
# Log retention (default: 90 days)
LOG_RETENTION_DAYS=90

# Soft-deleted records retention (default: 30 days)
SOFT_DELETE_RETENTION_DAYS=30

# Audit log retention (default: 365 days)
AUDIT_LOG_RETENTION_DAYS=365
```

### Retention Policies

1. **Log Retention**: Application logs older than `LOG_RETENTION_DAYS` are eligible for cleanup
2. **Soft Delete Retention**: Soft-deleted records older than `SOFT_DELETE_RETENTION_DAYS` can be permanently deleted
3. **Audit Log Retention**: Audit logs older than `AUDIT_LOG_RETENTION_DAYS` can be archived or deleted

### Cleanup Scripts

Run cleanup scripts periodically (e.g., via cron):

```bash
# Clean up old audit logs
tsx scripts/cleanup-audit-logs.ts

# Clean up old soft-deleted records
tsx scripts/cleanup-soft-deletes.ts
```

## PII Awareness

### Marking Sensitive Columns

To mark a column as containing Personally Identifiable Information (PII), add a comment in the schema:

```typescript
// In app/lib/db/schema.ts
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(), // PII: Email address
    // ... other fields
});
```

### PII Column Patterns

Common PII columns include:

- **Email addresses**: `users.email`, `user_invitations.email`
- **Phone numbers**: Any phone number fields
- **Names**: `user_profiles.full_name`
- **IP addresses**: `audit_logs.ip_address`
- **Billing information**: `accounts.billing_email`, payment method details

### Handling PII in Logs

When logging data that may contain PII:

1. **Never log full PII**: Use partial masking (e.g., `user@***.com`)
2. **Use IDs instead**: Log user IDs rather than email addresses when possible
3. **Audit logs**: Store PII only when necessary for compliance (e.g., audit logs)

Example:

```typescript
// ❌ Bad: Logging full email
logger.info("User logged in", { email: user.email });

// ✅ Good: Logging user ID only
logger.info("User logged in", { userId: user.id });

// ✅ Good: Masked email for debugging
logger.debug("User email", { email: maskEmail(user.email) });
```

### PII Masking Utilities

```typescript
// Mask email: user@example.com -> u***@***.com
function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    const maskedLocal = local[0] + "***";
    const maskedDomain = "***." + domain.split(".").pop();
    return `${maskedLocal}@${maskedDomain}`;
}

// Mask phone: +1234567890 -> +1***7890
function maskPhone(phone: string): string {
    return phone.slice(0, 2) + "***" + phone.slice(-4);
}
```

## Audit Logging

### Overview

All significant actions should be logged to the `audit_logs` table for compliance and debugging.

### Schema

```typescript
{
    id: uuid (PK)
    actorUserId: uuid (FK → users.id, nullable) // null for system actions
    accountId: uuid (FK → accounts.id, required)
    action: string // e.g., "user.created", "account.updated"
    targetType: string // e.g., "users", "accounts", "roles"
    targetId: uuid (nullable) // ID of the target entity
    changes: jsonb // JSON diff of changes (before/after)
    metadata: jsonb // Additional context
    ipAddress: string (nullable)
    userAgent: string (nullable)
    createdAt: timestamp
}
```

### Usage

#### Basic Audit Logging

```typescript
import { audit } from "~/lib/audit";

// Log a user action
await audit(
    user, // AppUser object
    "user.created", // Action name
    "users", // Target type
    newUserId, // Target ID
    { email: "new@example.com" }, // Changes
    { source: "signup" } // Metadata
);
```

#### With Diff

```typescript
import { audit, createDiff } from "~/lib/audit";

const before = { name: "Old Name", role: "user" };
const after = { name: "New Name", role: "admin" };

await audit(user, "user.updated", "users", userId, createDiff(before, after), {
    reason: "Role promotion",
});
```

#### System Actions

```typescript
import { auditSystemAction } from "~/lib/audit";

// Log a system action (no user)
await auditSystemAction(
    accountId,
    "account.auto_suspended",
    "accounts",
    accountId,
    { reason: "Payment failed" }
);
```

### Action Naming Convention

Use dot notation: `{entity}.{action}`

Examples:

- `user.created` - User was created
- `user.updated` - User was updated
- `user.deleted` - User was deleted
- `account.updated` - Account was updated
- `role.assigned` - Role was assigned to user
- `permission.granted` - Permission was granted
- `subscription.created` - Subscription was created
- `payment.processed` - Payment was processed

### Best Practices

1. **Log all mutations**: Create, update, delete operations
2. **Include context**: Add relevant metadata (IP, user agent, reason)
3. **Use diffs**: Show what changed, not just that it changed
4. **Don't log reads**: Only log mutations, not queries
5. **System actions**: Use `auditSystemAction` for automated processes

### Querying Audit Logs

```typescript
import { db } from "~/lib/db/index.server";
import { auditLogs } from "~/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";

// Get audit logs for an account
const logs = await db.query.auditLogs.findMany({
    where: eq(auditLogs.accountId, accountId),
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    limit: 100,
});

// Get audit logs for a specific user
const userLogs = await db.query.auditLogs.findMany({
    where: and(
        eq(auditLogs.accountId, accountId),
        eq(auditLogs.actorUserId, userId)
    ),
});

// Get audit logs for a specific entity
const entityLogs = await db.query.auditLogs.findMany({
    where: and(
        eq(auditLogs.accountId, accountId),
        eq(auditLogs.targetType, "users"),
        eq(auditLogs.targetId, userId)
    ),
});
```

## Data Export & Deletion

### Account Data Export

Use the export script to dump all account data:

```bash
tsx scripts/export-account.ts <account-id>
```

### Account Deletion

Use the deletion template script (requires superuser approval):

```bash
tsx scripts/delete-account-template.ts <account-id>
```

## Compliance Checklist

- [ ] Data retention policies configured
- [ ] PII columns documented in schema
- [ ] Audit logging implemented for all mutations
- [ ] Cleanup scripts scheduled (cron)
- [ ] Data export functionality tested
- [ ] Deletion procedures documented
- [ ] Privacy policy updated with retention periods
