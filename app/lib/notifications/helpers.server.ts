/**
 * Notification Helper Functions
 *
 * Convenience functions for common notification scenarios
 */

import {
    createNotification,
    type CreateNotificationOptions,
} from "./server";
import type { notificationTypeEnum } from "~/lib/db/schema";
import { db } from "~/lib/db/index.server";
import { roles, users } from "~/lib/db/schema";
import { eq, and, or, gte, isNull } from "drizzle-orm";

/**
 * Notify user of role assignment
 */
export async function notifyRoleAssigned(
    accountId: string,
    userId: string,
    roleName: string,
    assignedBy?: string
) {
    return createNotification({
        accountId,
        userId,
        type: "info",
        title: "Role Assigned",
        message: `You have been assigned the role "${roleName}"${assignedBy ? ` by ${assignedBy}` : ""}.`,
        actionUrl: "/dashboard/account/roles",
        actionLabel: "View Roles",
    });
}

/**
 * Notify users with specific roles
 */
export async function notifyRoleUsers(
    accountId: string,
    roleIds: string[],
    options: {
        type: typeof notificationTypeEnum.enumValues[number];
        title: string;
        message: string;
        actionUrl?: string;
        actionLabel?: string;
        metadata?: Record<string, unknown>;
    }
) {
    return createNotification({
        accountId,
        roleIds,
        type: options.type,
        title: options.title,
        message: options.message,
        actionUrl: options.actionUrl,
        actionLabel: options.actionLabel,
        metadata: options.metadata,
    });
}

/**
 * Notify account owners of important events
 */
export async function notifyAccountOwners(
    accountId: string,
    options: {
        type: typeof notificationTypeEnum.enumValues[number];
        title: string;
        message: string;
        actionUrl?: string;
        actionLabel?: string;
        metadata?: Record<string, unknown>;
    }
) {
    // Find owner role IDs (roles with access_level >= 2 or name = 'owner')
    const ownerRoles = await db.query.roles.findMany({
        where: and(
            eq(roles.accountId, accountId),
            or(
                gte(roles.accessLevel, 2),
                eq(roles.name, "owner")
            )
        ),
        columns: {
            id: true,
        },
    });

    const ownerRoleIds = ownerRoles.map((r) => r.id);

    if (ownerRoleIds.length === 0) {
        // Fallback: notify users with owner role enum
        const ownerUsers = await db.query.users.findMany({
            where: and(
                eq(users.accountId, accountId),
                eq(users.role, "owner"),
                isNull(users.deletedAt)
            ),
            columns: {
                id: true,
            },
        });

        // Create individual notifications for owner users
        const notifications = await Promise.all(
            ownerUsers.map((user) =>
                createNotification({
                    accountId,
                    userId: user.id,
                    type: options.type,
                    title: options.title,
                    message: options.message,
                    actionUrl: options.actionUrl,
                    actionLabel: options.actionLabel,
                    metadata: options.metadata,
                })
            )
        );

        return notifications.flat();
    }

    return createNotification({
        accountId,
        roleIds: ownerRoleIds,
        type: options.type,
        title: options.title,
        message: options.message,
        actionUrl: options.actionUrl,
        actionLabel: options.actionLabel,
        metadata: options.metadata,
    });
}

/**
 * Notify user of invitation acceptance
 */
export async function notifyInvitationAccepted(
    accountId: string,
    userId: string,
    inviterName?: string
) {
    return createNotification({
        accountId,
        userId,
        type: "success",
        title: "Welcome!",
        message: `You've successfully joined the team${inviterName ? ` (invited by ${inviterName})` : ""}.`,
        actionUrl: "/dashboard",
        actionLabel: "Go to Dashboard",
    });
}

/**
 * Notify user of billing event
 */
export async function notifyBillingEvent(
    accountId: string,
    userId: string,
    event: "payment_succeeded" | "payment_failed" | "subscription_canceled",
    details?: string
) {
    const eventConfig = {
        payment_succeeded: {
            type: "success" as const,
            title: "Payment Successful",
            message: details || "Your payment was processed successfully.",
        },
        payment_failed: {
            type: "error" as const,
            title: "Payment Failed",
            message: details || "There was an issue processing your payment. Please update your payment method.",
        },
        subscription_canceled: {
            type: "warning" as const,
            title: "Subscription Canceled",
            message: details || "Your subscription has been canceled.",
        },
    };

    const config = eventConfig[event];

    return createNotification({
        accountId,
        userId,
        type: config.type,
        title: config.title,
        message: config.message,
        actionUrl: "/dashboard/account/billing",
        actionLabel: "View Billing",
    });
}

