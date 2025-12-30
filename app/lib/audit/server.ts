/**
 * Audit Logging Service
 *
 * Provides audit logging functionality for compliance and data governance.
 * All significant actions should be logged for audit trails.
 */

import { db } from "~/lib/db/index.server";
import { auditLogs } from "~/lib/db/schema";
import { logger } from "~/lib/logging.server";
import { getRequestId, getRequestContext } from "~/lib/request-context.server";
import type { AppUser } from "~/lib/db/types";

export interface AuditLogOptions {
    actorUserId?: string; // User ID performing the action (null for system actions)
    accountId: string; // Account ID (required)
    action: string; // Action name (e.g., "user.created", "account.updated")
    targetType: string; // Target entity type (e.g., "users", "accounts", "roles")
    targetId?: string; // Target entity ID (optional for account-level actions)
    changes?: Record<string, unknown>; // JSON diff of changes
    metadata?: Record<string, unknown>; // Additional context
    ipAddress?: string; // IP address of the actor
    userAgent?: string; // User agent string
}

/**
 * Create an audit log entry
 */
export async function logAudit(options: AuditLogOptions): Promise<string> {
    const requestId = getRequestId();

    try {
        // Include requestId in metadata if it's available and not already present
        const metadata = {
            ...(options.metadata || {}),
            ...(requestId && requestId !== "unknown" && !options.metadata?.requestId
                ? { requestId }
                : {}),
        };

        const [auditLog] = await db
            .insert(auditLogs)
            .values({
                actorUserId: options.actorUserId || null,
                accountId: options.accountId,
                action: options.action,
                targetType: options.targetType,
                targetId: options.targetId || null,
                changes: options.changes || {},
                metadata,
                ipAddress: options.ipAddress || null,
                userAgent: options.userAgent || null,
            })
            .returning();

        logger.debug("Audit log created", {
            requestId,
            auditLogId: auditLog.id,
            action: options.action,
            targetType: options.targetType,
            accountId: options.accountId,
        });

        return auditLog.id;
    } catch (error) {
        logger.error("Failed to create audit log", {
            requestId,
            error,
            options,
        });
        throw error;
    }
}

/**
 * Audit logging helper with automatic user context
 * Automatically extracts IP address and user agent from request context if available
 */
export async function audit(
    user: AppUser | null,
    action: string,
    targetType: string,
    targetId?: string,
    changes?: Record<string, unknown>,
    metadata?: Record<string, unknown>
): Promise<string> {
    const context = getRequestContext();
    
    return logAudit({
        actorUserId: user?.id,
        accountId: user?.accountId || (metadata?.accountId as string) || "",
        action,
        targetType,
        targetId,
        changes,
        metadata,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
    });
}

/**
 * Create a diff object from before/after states
 */
export function createDiff<T extends Record<string, unknown>>(
    before: Partial<T>,
    after: Partial<T>
): Record<string, { before: unknown; after: unknown }> {
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
        const beforeValue = before[key];
        const afterValue = after[key];

        // Only include changed fields
        if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
            diff[key] = {
                before: beforeValue,
                after: afterValue,
            };
        }
    }

    return diff;
}

/**
 * Audit log for user actions (convenience wrapper)
 */
export async function auditUserAction(
    user: AppUser,
    action: string,
    targetType: string,
    targetId?: string,
    changes?: Record<string, unknown>,
    metadata?: Record<string, unknown>
): Promise<string> {
    return audit(user, action, targetType, targetId, changes, metadata);
}

/**
 * Audit log for system actions (no user)
 */
export async function auditSystemAction(
    accountId: string,
    action: string,
    targetType: string,
    targetId?: string,
    changes?: Record<string, unknown>,
    metadata?: Record<string, unknown>
): Promise<string> {
    return logAudit({
        actorUserId: undefined,
        accountId,
        action,
        targetType,
        targetId,
        changes,
        metadata,
    });
}

