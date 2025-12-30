#!/usr/bin/env tsx
/**
 * DELETE ACCOUNT TEMPLATE - DANGEROUS OPERATION
 *
 * ⚠️  WARNING: This script PERMANENTLY DELETES all data for an account.
 * ⚠️  This operation CANNOT be undone.
 * ⚠️  This is a HARD DELETE - data will be permanently removed from the database.
 *
 * This script requires:
 * 1. Multiple confirmation prompts
 * 2. Superuser/admin approval
 * 3. Account ID verification
 * 4. Dry-run mode (recommended first)
 *
 * Usage:
 *   DRY RUN (safe, shows what would be deleted):
 *     tsx scripts/delete-account-template.ts <account_id> --dry-run
 *
 *   ACTUAL DELETE (requires superuser approval):
 *     tsx scripts/delete-account-template.ts <account_id> --confirm --superuser-approval
 *
 * Safety Features:
 * - Dry-run mode shows what would be deleted without actually deleting
 * - Multiple confirmation prompts
 * - Requires superuser approval flag
 * - Shows account summary before deletion
 * - Logs all deletions for audit trail
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
import { eq, sql } from "drizzle-orm";
import * as readline from "readline";

// Environment variables check
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}

// Parse command line arguments
const accountId = process.argv[2];
const isDryRun = process.argv.includes("--dry-run");
const isConfirmed = process.argv.includes("--confirm");
const hasSuperuserApproval = process.argv.includes("--superuser-approval");

if (!accountId) {
    console.error("Error: account_id is required");
    console.error("\nUsage:");
    console.error(
        "  DRY RUN: tsx scripts/delete-account-template.ts <account_id> --dry-run"
    );
    console.error(
        "  DELETE:  tsx scripts/delete-account-template.ts <account_id> --confirm --superuser-approval"
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
const db = drizzle(client);

// Readline interface for prompts
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

interface DeletionSummary {
    account: any | null;
    users: number;
    roles: number;
    permissions: number;
    roleUsers: number;
    permissionRoles: number;
    userInvitations: number;
    userPreferences: number;
    userProfiles: number;
    creditBalances: number;
    creditLedger: number;
    usageCounters: number;
    usageEvents: number;
    usageMetrics: number;
    subscriptions: number;
    subscriptionItems: number;
}

async function getDeletionSummary(accountId: string): Promise<DeletionSummary> {
    // Get account info
    const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

    if (!account) {
        throw new Error(`Account with id ${accountId} not found`);
    }

    // Count records in each table
    const [
        usersCount,
        rolesCount,
        permissionsCount,
        roleUsersCount,
        permissionRolesCount,
        userInvitationsCount,
        userPreferencesCount,
        userProfilesCount,
        creditBalancesCount,
        creditLedgerCount,
        usageCountersCount,
        usageEventsCount,
        usageMetricsCount,
        subscriptionsCount,
        subscriptionItemsCount,
    ] = await Promise.all([
        db
            .select({ count: sql<number>`count(*)` })
            .from(users)
            .where(eq(users.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(roles)
            .where(eq(roles.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(permissions)
            .where(eq(permissions.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(roleUsers)
            .innerJoin(users, eq(roleUsers.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(permissionRoles)
            .innerJoin(roles, eq(permissionRoles.roleId, roles.id))
            .where(eq(roles.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(userInvitations)
            .where(eq(userInvitations.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(userPreferences)
            .innerJoin(users, eq(userPreferences.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(userProfiles)
            .innerJoin(users, eq(userProfiles.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(creditBalances)
            .where(eq(creditBalances.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(creditLedger)
            .where(eq(creditLedger.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(usageCounters)
            .where(eq(usageCounters.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(usageEvents)
            .where(eq(usageEvents.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(usageMetrics)
            .leftJoin(users, eq(usageMetrics.userId, users.id))
            .where(eq(users.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(subscriptions)
            .where(eq(subscriptions.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),

        db
            .select({ count: sql<number>`count(*)` })
            .from(subscriptionItems)
            .innerJoin(
                subscriptions,
                eq(subscriptionItems.subscriptionId, subscriptions.id)
            )
            .where(eq(subscriptions.accountId, accountId))
            .then((r) => Number(r[0]?.count || 0)),
    ]);

    return {
        account,
        users: usersCount,
        roles: rolesCount,
        permissions: permissionsCount,
        roleUsers: roleUsersCount,
        permissionRoles: permissionRolesCount,
        userInvitations: userInvitationsCount,
        userPreferences: userPreferencesCount,
        userProfiles: userProfilesCount,
        creditBalances: creditBalancesCount,
        creditLedger: creditLedgerCount,
        usageCounters: usageCountersCount,
        usageEvents: usageEventsCount,
        usageMetrics: usageMetricsCount,
        subscriptions: subscriptionsCount,
        subscriptionItems: subscriptionItemsCount,
    };
}

async function deleteAccountData(accountId: string): Promise<void> {
    console.log("\n=== Starting Deletion Process ===");

    // Delete in order to respect foreign key constraints
    // Start with child tables, end with account

    // 1. Delete subscription items (via subscriptions)
    const subscriptionIds = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.accountId, accountId));

    if (subscriptionIds.length > 0) {
        const subIds = subscriptionIds.map((s) => s.id);
        for (const subId of subIds) {
            await db
                .delete(subscriptionItems)
                .where(eq(subscriptionItems.subscriptionId, subId));
        }
        console.log(`✓ Deleted ${subscriptionIds.length} subscription item(s)`);
    }

    // 2. Delete subscriptions
    await db
        .delete(subscriptions)
        .where(eq(subscriptions.accountId, accountId));
    console.log("✓ Deleted subscriptions");

    // 3. Delete usage metrics (via users)
    const userIds = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.accountId, accountId));

    if (userIds.length > 0) {
        const uIds = userIds.map((u) => u.id);
        for (const userId of uIds) {
            await db
                .delete(usageMetrics)
                .where(eq(usageMetrics.userId, userId));
        }
        console.log(`✓ Deleted usage metrics`);
    }

    // 4. Delete usage events
    await db.delete(usageEvents).where(eq(usageEvents.accountId, accountId));
    console.log("✓ Deleted usage events");

    // 5. Delete usage counters
    await db
        .delete(usageCounters)
        .where(eq(usageCounters.accountId, accountId));
    console.log("✓ Deleted usage counters");

    // 6. Delete credit ledger
    await db.delete(creditLedger).where(eq(creditLedger.accountId, accountId));
    console.log("✓ Deleted credit ledger");

    // 7. Delete credit balances
    await db
        .delete(creditBalances)
        .where(eq(creditBalances.accountId, accountId));
    console.log("✓ Deleted credit balances");

    // 8. Delete user profiles
    if (userIds.length > 0) {
        const uIds = userIds.map((u) => u.id);
        for (const userId of uIds) {
            await db
                .delete(userProfiles)
                .where(eq(userProfiles.userId, userId));
        }
        console.log("✓ Deleted user profiles");
    }

    // 9. Delete user preferences
    if (userIds.length > 0) {
        const uIds = userIds.map((u) => u.id);
        for (const userId of uIds) {
            await db
                .delete(userPreferences)
                .where(eq(userPreferences.userId, userId));
        }
        console.log("✓ Deleted user preferences");
    }

    // 10. Delete user invitations
    await db
        .delete(userInvitations)
        .where(eq(userInvitations.accountId, accountId));
    console.log("✓ Deleted user invitations");

    // 11. Delete permission roles (via roles)
    const roleIds = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.accountId, accountId));

    if (roleIds.length > 0) {
        const rIds = roleIds.map((r) => r.id);
        for (const roleId of rIds) {
            await db
                .delete(permissionRoles)
                .where(eq(permissionRoles.roleId, roleId));
        }
        console.log("✓ Deleted permission roles");
    }

    // 12. Delete role users (via users)
    if (userIds.length > 0) {
        const uIds = userIds.map((u) => u.id);
        for (const userId of uIds) {
            await db.delete(roleUsers).where(eq(roleUsers.userId, userId));
        }
        console.log("✓ Deleted role users");
    }

    // 13. Delete permissions
    await db.delete(permissions).where(eq(permissions.accountId, accountId));
    console.log("✓ Deleted permissions");

    // 14. Delete roles
    await db.delete(roles).where(eq(roles.accountId, accountId));
    console.log("✓ Deleted roles");

    // 15. Delete users
    await db.delete(users).where(eq(users.accountId, accountId));
    console.log("✓ Deleted users");

    // 16. Finally, delete account
    await db.delete(accounts).where(eq(accounts.id, accountId));
    console.log("✓ Deleted account");

    console.log("\n=== Deletion Complete ===");
}

async function main() {
    try {
        console.log("\n" + "=".repeat(60));
        console.log("⚠️  ACCOUNT DELETION SCRIPT - DANGEROUS OPERATION");
        console.log("=".repeat(60));

        if (isDryRun) {
            console.log("\n🔍 DRY RUN MODE - No data will be deleted\n");
        } else {
            console.log("\n⚠️  LIVE MODE - Data will be PERMANENTLY DELETED\n");
        }

        // Get deletion summary
        const summary = await getDeletionSummary(accountId);

        // Display summary
        console.log("\n=== Account Summary ===");
        console.log(`Account ID: ${accountId}`);
        console.log(`Account Name: ${summary.account?.name || "N/A"}`);
        console.log(`Plan: ${summary.account?.plan || "N/A"}`);
        console.log(
            `Stripe Customer: ${summary.account?.stripeCustomerId || "N/A"}`
        );

        console.log("\n=== Records to be Deleted ===");
        console.log(`Users: ${summary.users}`);
        console.log(`Roles: ${summary.roles}`);
        console.log(`Permissions: ${summary.permissions}`);
        console.log(`Role Assignments: ${summary.roleUsers}`);
        console.log(`Permission Assignments: ${summary.permissionRoles}`);
        console.log(`Invitations: ${summary.userInvitations}`);
        console.log(`User Preferences: ${summary.userPreferences}`);
        console.log(`User Profiles: ${summary.userProfiles}`);
        console.log(`Credit Balances: ${summary.creditBalances}`);
        console.log(`Credit Ledger Entries: ${summary.creditLedger}`);
        console.log(`Usage Counters: ${summary.usageCounters}`);
        console.log(`Usage Events: ${summary.usageEvents}`);
        console.log(`Usage Metrics: ${summary.usageMetrics}`);
        console.log(`Subscriptions: ${summary.subscriptions}`);
        console.log(`Subscription Items: ${summary.subscriptionItems}`);

        const totalRecords =
            summary.users +
            summary.roles +
            summary.permissions +
            summary.roleUsers +
            summary.permissionRoles +
            summary.userInvitations +
            summary.userPreferences +
            summary.userProfiles +
            summary.creditBalances +
            summary.creditLedger +
            summary.usageCounters +
            summary.usageEvents +
            summary.usageMetrics +
            summary.subscriptions +
            summary.subscriptionItems +
            1; // +1 for account

        console.log(`\nTotal Records: ${totalRecords}`);

        if (isDryRun) {
            console.log("\n✅ Dry run complete. No data was deleted.");
            console.log(
                "To actually delete, run with --confirm --superuser-approval"
            );
            return;
        }

        // Safety checks for actual deletion
        if (!isConfirmed) {
            console.error(
                "\n❌ Error: --confirm flag is required for actual deletion"
            );
            console.error(
                "This is a safety measure to prevent accidental deletion."
            );
            process.exit(1);
        }

        if (!hasSuperuserApproval) {
            console.error("\n❌ Error: --superuser-approval flag is required");
            console.error("This operation requires superuser/admin approval.");
            process.exit(1);
        }

        // Additional confirmation prompts
        console.log("\n" + "=".repeat(60));
        console.log("⚠️  FINAL CONFIRMATION REQUIRED");
        console.log("=".repeat(60));

        const confirm1 = await question(
            `\nType the account ID to confirm deletion: `
        );
        if (confirm1 !== accountId) {
            console.error("\n❌ Account ID mismatch. Aborting deletion.");
            process.exit(1);
        }

        const confirm2 = await question(
            `\nType "DELETE" (all caps) to confirm: `
        );
        if (confirm2 !== "DELETE") {
            console.error("\n❌ Confirmation failed. Aborting deletion.");
            process.exit(1);
        }

        const confirm3 = await question(
            `\nAre you absolutely sure? This cannot be undone. (yes/no): `
        );
        if (confirm3.toLowerCase() !== "yes") {
            console.error("\n❌ Deletion cancelled.");
            process.exit(1);
        }

        // Perform deletion
        console.log("\n🚨 Starting deletion process...");
        await deleteAccountData(accountId);
        console.log("\n✅ Account deletion completed successfully.");
    } catch (error) {
        console.error("\n❌ Error during deletion:", error);
        process.exit(1);
    } finally {
        rl.close();
        await client.end();
    }
}

main();
