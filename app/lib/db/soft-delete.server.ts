/**
 * Soft Delete Utilities
 * 
 * Helper functions and query builders for working with soft-deleted records.
 * All main entity tables support soft deletes via the deleted_at column.
 */

import { isNull, and, eq, sql } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "./index.server";
import {
    users,
    accounts,
    roles,
    permissions,
    roleUsers,
    permissionRoles,
    userInvitations,
    userPreferences,
    userProfiles,
    plans,
    prices,
    subscriptions,
    subscriptionItems,
    usageMetrics,
} from "./schema";

/**
 * Type helper for tables with soft delete support
 */
type SoftDeletableTable = PgTable & {
    deletedAt: PgColumn;
};

/**
 * Drizzle condition to filter out deleted records
 * Use this in where clauses to exclude soft-deleted records
 */
export function isNotDeleted<T extends SoftDeletableTable>(
    table: T
): SQL<unknown> {
    return isNull(table.deletedAt);
}

/**
 * Drizzle condition to find only deleted records
 */
export function isDeleted<T extends SoftDeletableTable>(
    table: T
): SQL<unknown> {
    return sql`${table.deletedAt} IS NOT NULL`;
}

/**
 * Soft delete a record by setting deleted_at to current timestamp
 */
export async function softDelete<T extends SoftDeletableTable>(
    table: T,
    id: string,
    idColumn: PgColumn = (table as any).id
): Promise<void> {
    await db
        .update(table)
        .set({
            deletedAt: sql`now()`,
            updatedAt: sql`now()`,
        } as any)
        .where(eq(idColumn, id));
}

/**
 * Restore a soft-deleted record by clearing deleted_at
 */
export async function restore<T extends SoftDeletableTable>(
    table: T,
    id: string,
    idColumn: PgColumn = (table as any).id
): Promise<void> {
    await db
        .update(table)
        .set({
            deletedAt: null,
            updatedAt: sql`now()`,
        } as any)
        .where(eq(idColumn, id));
}

/**
 * Permanently delete a record (hard delete)
 * Use with caution - this actually removes the record from the database
 */
export async function hardDelete<T extends SoftDeletableTable>(
    table: T,
    id: string,
    idColumn: PgColumn = (table as any).id
): Promise<void> {
    await db.delete(table).where(eq(idColumn, id));
}

// ============================================================================
// Table-specific helper functions
// ============================================================================

/**
 * Find active (non-deleted) users
 */
export async function findActiveUsers(accountId: string) {
    return db
        .select()
        .from(users)
        .where(and(eq(users.accountId, accountId), isNotDeleted(users)));
}

/**
 * Find active user by ID
 */
export async function findActiveUserById(userId: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)))
        .limit(1);
    return user;
}

/**
 * Find active accounts
 */
export async function findActiveAccounts() {
    return db.select().from(accounts).where(isNotDeleted(accounts));
}

/**
 * Find active account by ID
 */
export async function findActiveAccountById(accountId: string) {
    const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), isNotDeleted(accounts)))
        .limit(1);
    return account;
}

/**
 * Find active roles for an account
 */
export async function findActiveRoles(accountId: string) {
    return db
        .select()
        .from(roles)
        .where(and(eq(roles.accountId, accountId), isNotDeleted(roles)));
}

/**
 * Find active role by ID
 */
export async function findActiveRoleById(roleId: string) {
    const [role] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.id, roleId), isNotDeleted(roles)))
        .limit(1);
    return role;
}

/**
 * Find active permissions for an account
 */
export async function findActivePermissions(accountId: string) {
    return db
        .select()
        .from(permissions)
        .where(
            and(eq(permissions.accountId, accountId), isNotDeleted(permissions))
        );
}

/**
 * Find active permission by ID
 */
export async function findActivePermissionById(permissionId: string) {
    const [permission] = await db
        .select()
        .from(permissions)
        .where(
            and(eq(permissions.id, permissionId), isNotDeleted(permissions))
        )
        .limit(1);
    return permission;
}

/**
 * Find active role-user assignments
 */
export async function findActiveRoleUsers(userId: string) {
    return db
        .select()
        .from(roleUsers)
        .where(and(eq(roleUsers.userId, userId), isNotDeleted(roleUsers)));
}

/**
 * Find active permission-role assignments
 */
export async function findActivePermissionRoles(roleId: string) {
    return db
        .select()
        .from(permissionRoles)
        .where(
            and(eq(permissionRoles.roleId, roleId), isNotDeleted(permissionRoles))
        );
}

/**
 * Find active user invitations for an account
 */
export async function findActiveUserInvitations(accountId: string) {
    return db
        .select()
        .from(userInvitations)
        .where(
            and(
                eq(userInvitations.accountId, accountId),
                isNotDeleted(userInvitations)
            )
        );
}

/**
 * Find active user invitation by token
 */
export async function findActiveUserInvitationByToken(token: string) {
    const [invitation] = await db
        .select()
        .from(userInvitations)
        .where(
            and(eq(userInvitations.token, token), isNotDeleted(userInvitations))
        )
        .limit(1);
    return invitation;
}

/**
 * Find active subscriptions for an account
 */
export async function findActiveSubscriptions(accountId: string) {
    return db
        .select()
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.accountId, accountId),
                isNotDeleted(subscriptions)
            )
        );
}

/**
 * Find active subscription by ID
 */
export async function findActiveSubscriptionById(subscriptionId: string) {
    const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.id, subscriptionId),
                isNotDeleted(subscriptions)
            )
        )
        .limit(1);
    return subscription;
}

/**
 * Find active plans
 */
export async function findActivePlans() {
    return db.select().from(plans).where(isNotDeleted(plans));
}

/**
 * Find active prices for a plan
 */
export async function findActivePrices(planId: string) {
    return db
        .select()
        .from(prices)
        .where(and(eq(prices.planId, planId), isNotDeleted(prices)));
}

