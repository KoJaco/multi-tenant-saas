# Compliance & Audit Logging Examples

Practical examples of using audit logging in the application.

## Basic Usage

### Logging User Creation

```typescript
import { audit, createDiff } from "~/lib/audit";
import { requireUser } from "~/lib/auth/auth.server";

export async function action({ request }: ActionFunctionArgs) {
    const { appUser } = await requireUser(request);
    const formData = await request.formData();
    
    // Create user...
    const newUser = await createUser(formData);
    
    // Log the action
    await audit(
        appUser,
        "user.created",
        "users",
        newUser.id,
        { email: newUser.email, role: newUser.role },
        { source: "admin_panel" }
    );
    
    return json({ success: true });
}
```

### Logging Updates with Diff

```typescript
import { audit, createDiff } from "~/lib/audit";

export async function action({ request }: ActionFunctionArgs) {
    const { appUser } = await requireUser(request);
    
    // Get existing user
    const before = await getUser(userId);
    
    // Update user
    const after = await updateUser(userId, updates);
    
    // Log with diff
    await audit(
        appUser,
        "user.updated",
        "users",
        userId,
        createDiff(before, after),
        { reason: "Role promotion" }
    );
    
    return json({ success: true });
}
```

### Logging Deletions

```typescript
import { audit } from "~/lib/audit";
import { softDelete } from "~/lib/db/soft-delete.server";

export async function action({ request }: ActionFunctionArgs) {
    const { appUser } = await requireUser(request);
    
    // Get user before deletion
    const user = await getUser(userId);
    
    // Soft delete
    await softDelete(users, userId);
    
    // Log deletion
    await audit(
        appUser,
        "user.deleted",
        "users",
        userId,
        { email: user.email, reason: "Account closure" },
        { deletedAt: new Date().toISOString() }
    );
    
    return json({ success: true });
}
```

### System Actions

```typescript
import { auditSystemAction } from "~/lib/audit";

// Log automated system action
await auditSystemAction(
    accountId,
    "subscription.auto_renewed",
    "subscriptions",
    subscriptionId,
    { 
        previousPeriodEnd: oldPeriodEnd,
        newPeriodEnd: newPeriodEnd 
    },
    { 
        stripeEventId: event.id,
        automated: true 
    }
);
```

## Route Integration

### Example: User Management Route

```typescript
import { audit, createDiff } from "~/lib/audit";
import { requireUser } from "~/lib/auth/auth.server";

export async function action({ request }: ActionFunctionArgs) {
    const { appUser } = await requireUser(request);
    const formData = await request.formData();
    const intent = formData.get("intent");
    
    switch (intent) {
        case "create":
            const newUser = await createUser(formData);
            await audit(
                appUser,
                "user.created",
                "users",
                newUser.id,
                { email: newUser.email }
            );
            break;
            
        case "update":
            const before = await getUser(userId);
            const after = await updateUser(userId, formData);
            await audit(
                appUser,
                "user.updated",
                "users",
                userId,
                createDiff(before, after)
            );
            break;
            
        case "delete":
            const user = await getUser(userId);
            await softDelete(users, userId);
            await audit(
                appUser,
                "user.deleted",
                "users",
                userId,
                { email: user.email }
            );
            break;
    }
    
    return json({ success: true });
}
```

## PII Handling

### Masking PII in Logs

```typescript
// Create utility functions
function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***";
    return `${local[0]}***@***.${domain.split(".").pop()}`;
}

function maskPhone(phone: string): string {
    return phone.slice(0, 2) + "***" + phone.slice(-4);
}

// Use in audit logs
await audit(
    appUser,
    "user.updated",
    "users",
    userId,
    {
        email: maskEmail(user.email), // Mask PII
        phone: maskPhone(user.phone), // Mask PII
        role: user.role, // Safe to log
    }
);
```

## Querying Audit Logs

### Get Audit Trail for an Entity

```typescript
import { db } from "~/lib/db/index.server";
import { auditLogs } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Get all audit logs for a specific user
const userAuditTrail = await db.query.auditLogs.findMany({
    where: and(
        eq(auditLogs.accountId, accountId),
        eq(auditLogs.targetType, "users"),
        eq(auditLogs.targetId, userId)
    ),
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    limit: 100,
});
```

### Get Recent Actions by User

```typescript
// Get recent actions by a specific user
const userActions = await db.query.auditLogs.findMany({
    where: and(
        eq(auditLogs.accountId, accountId),
        eq(auditLogs.actorUserId, userId)
    ),
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    limit: 50,
});
```

### Get Account Activity Summary

```typescript
// Get all actions for an account in a time range
const startDate = new Date();
startDate.setDate(startDate.getDate() - 30); // Last 30 days

const accountActivity = await db.query.auditLogs.findMany({
    where: and(
        eq(auditLogs.accountId, accountId),
        gte(auditLogs.createdAt, startDate)
    ),
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
});
```

