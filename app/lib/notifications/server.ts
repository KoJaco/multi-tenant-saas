/**
 * Notification Service
 *
 * Service for creating and managing in-app notifications.
 * Supports both individual user notifications and role-based propagation.
 */

import { db } from "~/lib/db/index.server";
import { notifications, roleUsers, users } from "~/lib/db/schema";
import { eq, and, inArray, or, isNull, sql } from "drizzle-orm";
import type { notificationTypeEnum } from "~/lib/db/schema";
import { logger } from "~/lib/logging.server";

export interface CreateNotificationOptions {
    accountId: string;
    userId?: string; // If provided, send to specific user
    roleIds?: string[]; // If provided, send to users with these roles
    type: (typeof notificationTypeEnum.enumValues)[number];
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
}

export interface NotificationFilters {
    accountId: string;
    userId?: string;
    read?: boolean;
    type?: (typeof notificationTypeEnum.enumValues)[number];
    limit?: number;
    offset?: number;
}

/**
 * Create a notification for a specific user
 */
export async function createUserNotification(
    options: CreateNotificationOptions
): Promise<string> {
    if (!options.userId) {
        throw new Error("userId is required for user notification");
    }

    const [notification] = await db
        .insert(notifications)
        .values({
            accountId: options.accountId,
            userId: options.userId,
            type: options.type,
            title: options.title,
            message: options.message,
            actionUrl: options.actionUrl,
            actionLabel: options.actionLabel,
            metadata: options.metadata || {},
            read: false,
        })
        .returning({ id: notifications.id });

    logger.info("User notification created", {
        notificationId: notification.id,
        userId: options.userId,
        accountId: options.accountId,
        type: options.type,
    });

    return notification.id;
}

/**
 * Create notifications for users with specific roles
 */
export async function createRoleBasedNotification(
    options: CreateNotificationOptions
): Promise<string[]> {
    if (!options.roleIds || options.roleIds.length === 0) {
        throw new Error("roleIds is required for role-based notification");
    }

    // Find all users with the specified roles in the account
    const usersWithRoles = await db
        .select({
            userId: roleUsers.userId,
        })
        .from(roleUsers)
        .innerJoin(users, eq(roleUsers.userId, users.id))
        .where(
            and(
                eq(users.accountId, options.accountId),
                inArray(roleUsers.roleId, options.roleIds),
                isNull(users.deletedAt) // Only active users
            )
        )
        .groupBy(roleUsers.userId);

    if (usersWithRoles.length === 0) {
        logger.warn("No users found with specified roles", {
            accountId: options.accountId,
            roleIds: options.roleIds,
        });
        return [];
    }

    const userIds = usersWithRoles.map((u) => u.userId);

    // Create notifications for each user
    const notificationValues = userIds.map((userId) => ({
        accountId: options.accountId,
        userId,
        roleIds: options.roleIds,
        type: options.type,
        title: options.title,
        message: options.message,
        actionUrl: options.actionUrl,
        actionLabel: options.actionLabel,
        metadata: options.metadata || {},
        read: false,
    }));

    const created = await db
        .insert(notifications)
        .values(notificationValues)
        .returning({ id: notifications.id });

    logger.info("Role-based notifications created", {
        notificationIds: created.map((n) => n.id),
        accountId: options.accountId,
        roleIds: options.roleIds,
        userCount: userIds.length,
        type: options.type,
    });

    return created.map((n) => n.id);
}

/**
 * Create a notification (automatically determines user vs role-based)
 */
export async function createNotification(
    options: CreateNotificationOptions
): Promise<string | string[]> {
    if (options.userId) {
        return createUserNotification(options);
    } else if (options.roleIds && options.roleIds.length > 0) {
        return createRoleBasedNotification(options);
    } else {
        throw new Error(
            "Either userId or roleIds must be provided for notification"
        );
    }
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(
    filters: NotificationFilters
): Promise<Array<typeof notifications.$inferSelect>> {
    if (!filters.userId) {
        throw new Error("userId is required");
    }

    const conditions = [
        eq(notifications.accountId, filters.accountId),
        eq(notifications.userId, filters.userId),
    ];

    if (filters.read !== undefined) {
        conditions.push(eq(notifications.read, filters.read));
    }

    if (filters.type) {
        conditions.push(eq(notifications.type, filters.type));
    }

    const query = db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: (notifications, { desc }) => [desc(notifications.createdAt)],
        limit: filters.limit || 50,
        offset: filters.offset || 0,
    });

    return query;
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(
    accountId: string,
    userId: string
): Promise<number> {
    const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(
            and(
                eq(notifications.accountId, accountId),
                eq(notifications.userId, userId),
                eq(notifications.read, false)
            )
        );

    return Number(result[0]?.count || 0);
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(
    notificationId: string,
    userId: string,
    accountId: string
): Promise<void> {
    await db
        .update(notifications)
        .set({
            read: true,
            readAt: new Date(),
        })
        .where(
            and(
                eq(notifications.id, notificationId),
                eq(notifications.userId, userId), // Ensure user owns the notification
                eq(notifications.accountId, accountId) // also ensure the notification belongs to the account
            )
        );

    logger.info("Notification marked as read", {
        notificationId,
        userId,
    });
}

/**
 * Mark notification as unread
 */
export async function markNotificationUnread(
    notificationId: string,
    userId: string,
    accountId: string
): Promise<void> {
    await db
        .update(notifications)
        .set({
            read: false,
            readAt: null,
        })
        .where(
            and(
                eq(notifications.id, notificationId),
                eq(notifications.userId, userId),
                eq(notifications.accountId, accountId)
            )
        );

    logger.info("Notification marked as unread", {
        notificationId,
        userId,
    });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(
    accountId: string,
    userId: string
): Promise<number> {
    const result = await db
        .update(notifications)
        .set({
            read: true,
            readAt: new Date(),
        })
        .where(
            and(
                eq(notifications.accountId, accountId),
                eq(notifications.userId, userId),
                eq(notifications.read, false)
            )
        )
        .returning({ id: notifications.id });

    logger.info("All notifications marked as read", {
        userId,
        accountId,
        count: result.length,
    });

    return result.length;
}

/**
 * Delete a notification
 */
export async function deleteNotification(
    notificationId: string,
    userId: string,
    accountId: string
): Promise<void> {
    await db
        .delete(notifications)
        .where(
            and(
                eq(notifications.id, notificationId),
                eq(notifications.userId, userId),
                eq(notifications.accountId, accountId)
            )
        );

    logger.info("Notification deleted", {
        notificationId,
        userId,
    });
}
