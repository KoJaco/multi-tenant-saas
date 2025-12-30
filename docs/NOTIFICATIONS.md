# Notifications System

In-app notification system with role-based propagation and individual user notifications.

## Overview

The notification system provides:
- **In-app notifications** stored in database
- **Role-based propagation** - send to users with specific roles
- **Individual notifications** - send to specific users
- **Read/unread tracking** - mark notifications as read
- **Type-based filtering** - filter by notification type
- **Action URLs** - link notifications to relevant pages

## Architecture

```
┌─────────────┐
│ Application │
└──────┬──────┘
       │ createNotification()
       ▼
┌─────────────────┐
│ Notification    │
│    Service      │
└──────┬──────────┘
       │
       ├──▶ Individual User
       └──▶ Role-Based (multiple users)
```

## Database Schema

### notifications Table

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    user_id UUID REFERENCES users(id), -- null for role-based
    role_ids UUID[], -- Array of role IDs for role-based
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    action_label TEXT,
    metadata JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

**Key Features**:
- `user_id` - null for role-based notifications
- `role_ids` - array of role IDs for role-based propagation
- `type` - info, success, warning, error, critical
- `read` - tracks read status
- Indexed for efficient queries

## Usage

### Create Individual Notification

```typescript
import { createNotification } from "~/lib/notifications/server";

await createNotification({
    accountId: "account-123",
    userId: "user-456",
    type: "info",
    title: "Welcome!",
    message: "You've been added to the team.",
    actionUrl: "/dashboard",
    actionLabel: "Go to Dashboard",
});
```

### Create Role-Based Notification

```typescript
import { createNotification } from "~/lib/notifications/server";

// Notify all users with specific roles
await createNotification({
    accountId: "account-123",
    roleIds: ["role-1", "role-2"], // Array of role IDs
    type: "warning",
    title: "System Maintenance",
    message: "Scheduled maintenance will occur tonight at 2 AM.",
    actionUrl: "/dashboard/maintenance",
    actionLabel: "Learn More",
});
```

### Get User Notifications

```typescript
import { getUserNotifications } from "~/lib/notifications/server";

const notifications = await getUserNotifications({
    accountId: "account-123",
    userId: "user-456",
    read: false, // Only unread
    type: "info", // Optional type filter
    limit: 20,
    offset: 0,
});
```

### Get Unread Count

```typescript
import { getUnreadNotificationCount } from "~/lib/notifications/server";

const count = await getUnreadNotificationCount(
    "account-123",
    "user-456"
);
```

### Mark as Read/Unread

```typescript
import {
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
} from "~/lib/notifications/server";

// Mark single notification as read
await markNotificationRead("notification-id", "user-id");

// Mark as unread
await markNotificationUnread("notification-id", "user-id");

// Mark all as read
const count = await markAllNotificationsRead("account-id", "user-id");
```

### Delete Notification

```typescript
import { deleteNotification } from "~/lib/notifications/server";

await deleteNotification("notification-id", "user-id");
```

## Helper Functions

### Notify Role Assignment

```typescript
import { notifyRoleAssigned } from "~/lib/notifications/helpers.server";

await notifyRoleAssigned(
    "account-123",
    "user-456",
    "Admin",
    "Jane Doe" // Optional: who assigned the role
);
```

### Notify Role Users

```typescript
import { notifyRoleUsers } from "~/lib/notifications/helpers.server";

await notifyRoleUsers("account-123", ["role-1", "role-2"], {
    type: "info",
    title: "New Feature Available",
    message: "Check out our new dashboard!",
    actionUrl: "/dashboard",
    actionLabel: "Explore",
});
```

### Notify Account Owners

```typescript
import { notifyAccountOwners } from "~/lib/notifications/helpers.server";

await notifyAccountOwners("account-123", {
    type: "critical",
    title: "Payment Failed",
    message: "Your payment method failed. Please update it.",
    actionUrl: "/dashboard/account/billing",
    actionLabel: "Update Payment",
});
```

### Notify Billing Events

```typescript
import { notifyBillingEvent } from "~/lib/notifications/helpers.server";

// Payment succeeded
await notifyBillingEvent(
    "account-123",
    "user-456",
    "payment_succeeded"
);

// Payment failed
await notifyBillingEvent(
    "account-123",
    "user-456",
    "payment_failed",
    "Your card was declined."
);
```

## API Endpoints

### GET `/api/notifications`

Get notifications for the current user.

**Query Parameters**:
- `read` - Filter by read status (`true` or `false`)
- `type` - Filter by type (`info`, `success`, `warning`, `error`, `critical`)
- `limit` - Limit results (default: 50)
- `offset` - Offset for pagination (default: 0)

**Special Intent**: `?intent=count` - Returns unread count only

**Response**:
```json
{
    "notifications": [
        {
            "id": "uuid",
            "accountId": "uuid",
            "userId": "uuid",
            "type": "info",
            "title": "Welcome!",
            "message": "You've been added to the team.",
            "actionUrl": "/dashboard",
            "actionLabel": "Go to Dashboard",
            "read": false,
            "readAt": null,
            "createdAt": "2024-01-01T00:00:00Z"
        }
    ]
}
```

### POST `/api/notifications`

Perform notification actions.

**Form Data**:
- `intent` - Action to perform:
  - `mark-read` - Mark notification as read
  - `mark-unread` - Mark notification as unread
  - `mark-all-read` - Mark all notifications as read
  - `delete` - Delete notification
  - `create` - Create new notification (admin only)

**For `mark-read` / `mark-unread` / `delete`**:
- `notificationId` - UUID of notification

**For `create`**:
- `userId` - UUID (optional, for individual notification)
- `roleIds` - JSON array of UUIDs (optional, for role-based)
- `type` - Notification type
- `title` - Notification title
- `message` - Notification message
- `actionUrl` - Optional action URL
- `actionLabel` - Optional action label
- `metadata` - Optional JSON metadata

**Response**:
```json
{
    "success": true,
    "count": 5 // For mark-all-read
}
```

## Notification Types

- `info` - General information (role assignment, updates)
- `success` - Positive actions (task complete, payment succeeded)
- `warning` - Potential issues (maintenance, limits approaching)
- `error` - Errors (payment failed, action failed)
- `critical` - High-priority alerts (security, billing)

## Role-Based Propagation

When creating a role-based notification:

1. System finds all users with the specified roles in the account
2. Creates a notification record for each user
3. Links notifications via `roleIds` array
4. Users see notifications in their personal feed

**Example**:
```typescript
// Notify all admins
await createNotification({
    accountId: "account-123",
    roleIds: ["admin-role-id"],
    type: "warning",
    title: "System Alert",
    message: "High CPU usage detected.",
});
```

This creates notifications for all users with the admin role.

## Best Practices

1. **Use appropriate types** - Choose the right notification type
2. **Include action URLs** - Make notifications actionable
3. **Role-based for groups** - Use role-based for team-wide notifications
4. **Individual for personal** - Use individual for user-specific events
5. **Clean up old notifications** - Consider archiving/deleting old notifications
6. **Respect user preferences** - Allow users to control notification types
7. **Batch operations** - Use `mark-all-read` for better UX

## Examples

### User Joins Team

```typescript
import { notifyInvitationAccepted } from "~/lib/notifications/helpers.server";

await notifyInvitationAccepted(
    accountId,
    newUserId,
    inviterName
);
```

### System Maintenance Alert

```typescript
import { notifyRoleUsers } from "~/lib/notifications/helpers.server";

// Notify all users
const allRoles = await getAccountRoles(accountId);
const roleIds = allRoles.map((r) => r.id);

await notifyRoleUsers(accountId, roleIds, {
    type: "warning",
    title: "Scheduled Maintenance",
    message: "System will be unavailable from 2-4 AM tonight.",
    actionUrl: "/maintenance-info",
    actionLabel: "Learn More",
});
```

### Payment Issue Alert

```typescript
import { notifyAccountOwners } from "~/lib/notifications/helpers.server";

await notifyAccountOwners(accountId, {
    type: "critical",
    title: "Payment Method Expired",
    message: "Your payment method has expired. Please update it to avoid service interruption.",
    actionUrl: "/dashboard/account/billing",
    actionLabel: "Update Payment",
});
```

## Frontend Integration

### Fetch Notifications

```typescript
// Get unread count
const countResponse = await fetch("/api/notifications?intent=count");
const { count } = await countResponse.json();

// Get notifications
const response = await fetch("/api/notifications?read=false&limit=20");
const { notifications } = await response.json();
```

### Mark as Read

```typescript
const formData = new FormData();
formData.append("intent", "mark-read");
formData.append("notificationId", notificationId);

await fetch("/api/notifications", {
    method: "POST",
    body: formData,
});
```

### Mark All as Read

```typescript
const formData = new FormData();
formData.append("intent", "mark-all-read");

const response = await fetch("/api/notifications", {
    method: "POST",
    body: formData,
});
const { count } = await response.json();
```

## Next Steps

- **[Permissions](AUTH.md)**: Role-based access control
- **[Email](EMAIL.md)**: Email notifications
- **[Webhooks](WEBHOOKS.md)**: Webhook notifications

