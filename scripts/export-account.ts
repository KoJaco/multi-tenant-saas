#!/usr/bin/env tsx
/**
 * Export Account Data Script
 *
 * This script exports all tenant data for a given account_id to JSON.
 * The export includes all tenant-scoped tables and their relationships.
 *
 * Usage:
 *   tsx scripts/export-account.ts <account_id>
 *   or
 *   tsx scripts/export-account.ts <account_id> --output backup-<timestamp>.json
 *
 * Example:
 *   tsx scripts/export-account.ts 123e4567-e89b-12d3-a456-426614174000
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../app/lib/db/schema.js";
import {
    accounts,
    users,
    roles,
    permissions,
    roleUsers,
    permissionRoles,
    userInvitations,
    userPreferences,
    userProfiles,
    creditBalances,
    creditLedger,
    usageCounters,
    usageEvents,
    usageMetrics,
    subscriptions,
    subscriptionItems,
} from "../app/lib/db/schema.js";
import { eq } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";

// Environment variables check
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}

// Parse command line arguments
const accountId = process.argv[2];
const outputFile = process.argv[3] || `backup-${accountId}-${Date.now()}.json`;

if (!accountId) {
    console.error("Error: account_id is required");
    console.error(
        "Usage: tsx scripts/export-account.ts <account_id> [output_file]"
    );
    process.exit(1);
}

// Validate UUID format
const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(accountId)) {
    console.error("Error: account_id must be a valid UUID");
    process.exit(1);
}

// Initialize database client
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

interface ExportData {
    metadata: {
        accountId: string;
        exportedAt: string;
        exportedBy?: string;
        version: string;
    };
    account: any;
    users: any[];
    roles: any[];
    permissions: any[];
    roleUsers: any[];
    permissionRoles: any[];
    userInvitations: any[];
    userPreferences: any[];
    userProfiles: any[];
    creditBalances: any | null;
    creditLedger: any[];
    usageCounters: any[];
    usageEvents: any[];
    usageMetrics: any[];
    subscriptions: any[];
    subscriptionItems: any[];
}

async function exportAccountData(accountId: string): Promise<ExportData> {
    console.log(`Exporting data for account: ${accountId}`);

    // Export account record
    const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

    if (!account) {
        throw new Error(`Account with id ${accountId} not found`);
    }

    console.log(`Found account: ${account.name}`);

    // Export all tenant-scoped tables
    const [
        usersData,
        rolesData,
        permissionsData,
        roleUsersData,
        permissionRolesData,
        userInvitationsData,
        userPreferencesData,
        userProfilesData,
        creditBalancesData,
        creditLedgerData,
        usageCountersData,
        usageEventsData,
        usageMetricsData,
        subscriptionsData,
        subscriptionItemsData,
    ] = await Promise.all([
        // Users
        db.select().from(users).where(eq(users.accountId, accountId)),

        // Roles
        db.select().from(roles).where(eq(roles.accountId, accountId)),

        // Permissions
        db
            .select()
            .from(permissions)
            .where(eq(permissions.accountId, accountId)),

        // Role Users (via user accountId)
        db
            .select()
            .from(roleUsers)
            .innerJoin(users, eq(roleUsers.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    userId: r.role_users.userId,
                    roleId: r.role_users.roleId,
                    assignedBy: r.role_users.assignedBy,
                    assignedAt: r.role_users.assignedAt,
                    createdAt: r.role_users.createdAt,
                    updatedAt: r.role_users.updatedAt,
                    deletedAt: r.role_users.deletedAt,
                }))
            ),

        // Permission Roles (via role accountId)
        db
            .select()
            .from(permissionRoles)
            .innerJoin(roles, eq(permissionRoles.roleId, roles.id))
            .where(eq(roles.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    roleId: r.permission_roles.roleId,
                    permissionId: r.permission_roles.permissionId,
                    createdAt: r.permission_roles.createdAt,
                    updatedAt: r.permission_roles.updatedAt,
                    deletedAt: r.permission_roles.deletedAt,
                }))
            ),

        // User Invitations
        db
            .select()
            .from(userInvitations)
            .where(eq(userInvitations.accountId, accountId)),

        // User Preferences (via user accountId)
        db
            .select()
            .from(userPreferences)
            .innerJoin(users, eq(userPreferences.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    id: r.user_preferences.id,
                    userId: r.user_preferences.userId,
                    settings: r.user_preferences.settings,
                    createdAt: r.user_preferences.createdAt,
                    updatedAt: r.user_preferences.updatedAt,
                    deletedAt: r.user_preferences.deletedAt,
                }))
            ),

        // User Profiles (via user accountId)
        db
            .select()
            .from(userProfiles)
            .innerJoin(users, eq(userProfiles.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    id: r.user_profiles.id,
                    userId: r.user_profiles.userId,
                    fullName: r.user_profiles.fullName,
                    avatarBlob: r.user_profiles.avatarBlob,
                    bio: r.user_profiles.bio,
                    createdAt: r.user_profiles.createdAt,
                    updatedAt: r.user_profiles.updatedAt,
                    deletedAt: r.user_profiles.deletedAt,
                }))
            ),

        // Credit Balances
        db
            .select()
            .from(creditBalances)
            .where(eq(creditBalances.accountId, accountId))
            .then((results) => results[0] || null),

        // Credit Ledger
        db
            .select()
            .from(creditLedger)
            .where(eq(creditLedger.accountId, accountId)),

        // Usage Counters
        db
            .select()
            .from(usageCounters)
            .where(eq(usageCounters.accountId, accountId)),

        // Usage Events
        db
            .select()
            .from(usageEvents)
            .where(eq(usageEvents.accountId, accountId)),

        // Usage Metrics (via user accountId)
        db
            .select()
            .from(usageMetrics)
            .leftJoin(users, eq(usageMetrics.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    id: r.usage_metrics.id,
                    userId: r.usage_metrics.userId,
                    metricType: r.usage_metrics.metricType,
                    data: r.usage_metrics.data,
                    createdAt: r.usage_metrics.createdAt,
                    updatedAt: r.usage_metrics.updatedAt,
                    deletedAt: r.usage_metrics.deletedAt,
                }))
            ),

        // Subscriptions
        db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.accountId, accountId)),

        // Subscription Items (via subscription accountId)
        db
            .select()
            .from(subscriptionItems)
            .innerJoin(
                subscriptions,
                eq(subscriptionItems.subscriptionId, subscriptions.id)
            )
            .where(eq(subscriptions.accountId, accountId))
            .then((results) =>
                results.map((r) => ({
                    id: r.subscription_items.id,
                    stripe_id: r.subscription_items.stripe_id,
                    subscriptionId: r.subscription_items.subscriptionId,
                    priceId: r.subscription_items.priceId,
                    quantity: r.subscription_items.quantity,
                    createdAt: r.subscription_items.createdAt,
                    updatedAt: r.subscription_items.updatedAt,
                    deletedAt: r.subscription_items.deletedAt,
                }))
            ),
    ]);

    const exportData: ExportData = {
        metadata: {
            accountId,
            exportedAt: new Date().toISOString(),
            version: "1.0.0",
        },
        account,
        users: usersData,
        roles: rolesData,
        permissions: permissionsData,
        roleUsers: roleUsersData,
        permissionRoles: permissionRolesData,
        userInvitations: userInvitationsData,
        userPreferences: userPreferencesData,
        userProfiles: userProfilesData,
        creditBalances: creditBalancesData,
        creditLedger: creditLedgerData,
        usageCounters: usageCountersData,
        usageEvents: usageEventsData,
        usageMetrics: usageMetricsData,
        subscriptions: subscriptionsData,
        subscriptionItems: subscriptionItemsData,
    };

    return exportData;
}

async function main() {
    try {
        const exportData = await exportAccountData(accountId);

        // Write to file
        const outputPath = join(process.cwd(), outputFile);
        writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

        // Print summary
        console.log("\n=== Export Summary ===");
        console.log(`Account: ${exportData.account.name} (${accountId})`);
        console.log(`Users: ${exportData.users.length}`);
        console.log(`Roles: ${exportData.roles.length}`);
        console.log(`Permissions: ${exportData.permissions.length}`);
        console.log(`Role Assignments: ${exportData.roleUsers.length}`);
        console.log(
            `Permission Assignments: ${exportData.permissionRoles.length}`
        );
        console.log(`Invitations: ${exportData.userInvitations.length}`);
        console.log(`Subscriptions: ${exportData.subscriptions.length}`);
        console.log(`Credit Ledger Entries: ${exportData.creditLedger.length}`);
        console.log(`Usage Events: ${exportData.usageEvents.length}`);
        console.log(`\nExport saved to: ${outputPath}`);
        console.log(
            `Total size: ${(JSON.stringify(exportData).length / 1024).toFixed(2)} KB`
        );
    } catch (error) {
        console.error("Error exporting account data:", error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
