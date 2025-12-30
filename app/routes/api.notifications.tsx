/**
 * Notifications API
 *
 * API endpoints for managing in-app notifications
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth/auth.server";
import {
    getUserNotifications,
    getUnreadNotificationCount,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
    deleteNotification,
    createNotification,
} from "~/lib/notifications/server";
import { createErrorResponse } from "~/lib/errors.server";
import {
    initRequestContext,
    withRequestContext,
} from "~/lib/request-context.server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { roles, users } from "~/lib/db/schema";

const notificationFiltersSchema = z.object({
    read: z
        .enum(["true", "false"])
        .optional()
        .transform((val) => val === "true"),
    type: z
        .enum(["info", "success", "warning", "error", "critical"])
        .optional(),
    limit: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) return undefined;
            const parsed = parseInt(val, 10);
            return isNaN(parsed) ? undefined : parsed;
        }),
    offset: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) return undefined;
            const parsed = parseInt(val, 10);
            return isNaN(parsed) ? undefined : parsed;
        }),
});

const markReadSchema = z.object({
    notificationId: z.string().uuid(),
});

const createNotificationSchema = z.object({
    userId: z.string().uuid().optional(),
    roleIds: z.array(z.string().uuid()).optional(),
    type: z.enum(["info", "success", "warning", "error", "critical"]),
    title: z.string().min(1),
    message: z.string().min(1),
    actionUrl: z.string().url().optional(),
    actionLabel: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);
            const url = new URL(request.url);
            const intent = url.searchParams.get("intent");

            // Get unread count
            if (intent === "count") {
                const count = await getUnreadNotificationCount(
                    appUser.accountId,
                    appUser.id
                );
                return { count };
            }

            // Get notifications
            const filters = notificationFiltersSchema.parse(
                Object.fromEntries(url.searchParams)
            );

            const notifications = await getUserNotifications({
                accountId: appUser.accountId,
                userId: appUser.id,
                ...filters,
            });

            return { notifications };
        } catch (error) {
            return createErrorResponse(
                error,
                "Failed to fetch notifications",
                500
            );
        }
    });
}

export async function action({ request }: ActionFunctionArgs) {
    const { logger } = await import("~/lib/logging.server");
    const { db } = await import("~/lib/db/index.server");

    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);
            const formData = await request.formData();
            const intent = formData.get("intent");

            switch (intent) {
                case "mark-read": {
                    const { notificationId } = markReadSchema.parse({
                        notificationId: formData.get("notificationId"),
                    });
                    await markNotificationRead(
                        notificationId,
                        appUser.id,
                        appUser.accountId
                    );
                    return { success: true };
                }

                case "mark-unread": {
                    const { notificationId } = markReadSchema.parse({
                        notificationId: formData.get("notificationId"),
                    });
                    await markNotificationUnread(
                        notificationId,
                        appUser.id,
                        appUser.accountId
                    );
                    return { success: true };
                }

                case "mark-all-read": {
                    const count = await markAllNotificationsRead(
                        appUser.accountId,
                        appUser.id
                    );
                    return { success: true, count };
                }

                case "delete": {
                    const { notificationId } = markReadSchema.parse({
                        notificationId: formData.get("notificationId"),
                    });
                    await deleteNotification(
                        notificationId,
                        appUser.id,
                        appUser.accountId
                    );
                    return { success: true };
                }

                case "create": {
                    let parsedRoleIds: string[] | undefined = undefined;
                    let parsedMetadata: Record<string, unknown> | undefined =
                        undefined;
                    // try to parse roleIds to array of string
                    try {
                        parsedRoleIds = JSON.parse(
                            formData.get("roleIds") as string
                        ) as string[];
                    } catch (error) {
                        logger.info(
                            "Error while parsing roleIds, falling back to undefined",
                            {
                                error,
                                roleIds: formData.get("roleIds"),
                            }
                        );
                    }

                    try {
                        parsedMetadata = JSON.parse(
                            formData.get("metadata") as string
                        ) as Record<string, unknown>;
                    } catch (error) {
                        logger.info(
                            "Error while parsing metadata, falling back to undefined",
                            {
                                error,
                                metadata: formData.get("metadata"),
                            }
                        );
                    }

                    // Only allow creating notifications for own account
                    const data = createNotificationSchema.parse({
                        userId: formData.get("userId") || undefined,
                        roleIds: parsedRoleIds,
                        type: formData.get("type"),
                        title: formData.get("title"),
                        message: formData.get("message"),
                        actionUrl: formData.get("actionUrl") || undefined,
                        actionLabel: formData.get("actionLabel") || undefined,
                        metadata: parsedMetadata,
                    });

                    if (data.userId) {
                        const targetUser = await db.query.users.findFirst({
                            where: and(
                                eq(users.id, data.userId),
                                eq(users.accountId, appUser.accountId)
                            ),
                            columns: { id: true },
                        });
                        if (!targetUser) {
                            return createErrorResponse(
                                new Error(
                                    "Target user not found in this account"
                                ),
                                "Target user not found in this account",
                                404
                            );
                        }
                    }

                    // Verify roleIds belong to account if provided
                    if (data.roleIds && data.roleIds.length > 0) {
                        const validRoles = await db
                            .select({ id: roles.id })
                            .from(roles)
                            .where(
                                and(
                                    eq(roles.accountId, appUser.accountId),
                                    inArray(roles.id, data.roleIds)
                                )
                            );

                        if (validRoles.length !== data.roleIds.length) {
                            return createErrorResponse(
                                new Error(
                                    "One or more roles not found in account"
                                ),
                                "Invalid role IDs",
                                400
                            );
                        }
                    }

                    const result = await createNotification({
                        accountId: appUser.accountId,
                        ...data,
                    });

                    return {
                        success: true,
                        notificationIds: Array.isArray(result)
                            ? result
                            : [result],
                    };
                }

                default:
                    return createErrorResponse(
                        new Error("Invalid intent"),
                        "Invalid action intent",
                        400
                    );
            }
        } catch (error) {
            return createErrorResponse(
                error,
                "Failed to process notification action",
                500
            );
        }
    });
}
