#!/usr/bin/env tsx
/**
 * Remove RLS Test Data Script
 *
 * Cleans up test data created by test-rls-policies.ts script.
 * This script identifies and removes:
 * - Test accounts (names starting with "RLS Test Account")
 * - Test users (emails matching pattern rls-test-*-*@test.local)
 * - Associated roles, permissions, and other related data
 *
 * Usage:
 *   tsx scripts/remove-test-rls-policies-data.ts
 *   or
 *   npm run remove-test-rls-data
 *
 * Prerequisites:
 *   - DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY must be set
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
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
    notifications,
    auditLogs,
} from "../app/lib/db/schema.js";
import { eq, like, or, inArray } from "drizzle-orm";

// Color codes for terminal output
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
};

function success(message: string) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function error(message: string) {
    console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function info(message: string) {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function warn(message: string) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function section(title: string) {
    console.log(`\n${colors.cyan}━━━ ${title} ━━━${colors.reset}`);
}

// Check environment variables
const requiredEnvVars = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        error(`${envVar} environment variable is required`);
        process.exit(1);
    }
}

const DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

// Initialize clients
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const dbClient = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(dbClient, { schema });

/**
 * Find all test accounts (including soft-deleted)
 */
async function findTestAccounts() {
    // Try multiple patterns to catch test accounts
    // Note: We don't filter by deleted_at to catch soft-deleted test accounts too
    const testAccounts = await db
        .select({
            id: accounts.id,
            name: accounts.name,
            deletedAt: accounts.deletedAt,
        })
        .from(accounts)
        .where(
            or(
                like(accounts.name, "RLS Test Account%"),
                like(accounts.name, "rls-test-account%"),
                like(accounts.name, "%RLS Test%"),
                like(accounts.name, "%test account%"),
                like(accounts.name, "Updated Account Name%")
            )
        );

    return testAccounts;
}

/**
 * Find all test users (by email pattern, including soft-deleted)
 */
async function findTestUsers() {
    // Try multiple patterns to catch test users
    // Note: We don't filter by deleted_at to catch soft-deleted test users too
    const testUsers = await db
        .select({
            id: users.id,
            email: users.email,
            accountId: users.accountId,
            deletedAt: users.deletedAt,
        })
        .from(users)
        .where(
            or(
                like(users.email, "rls-test-%@test.local"),
                like(users.email, "RLS-TEST-%@test.local"),
                like(users.email, "%@test.local"),
                like(users.email, "%rls-test%@%")
            )
        );

    return testUsers;
}

/**
 * List all accounts and users for debugging
 */
async function listAllAccountsAndUsers() {
    section("Debug: All Accounts and Users");

    const allAccounts = await db
        .select({
            id: accounts.id,
            name: accounts.name,
            createdAt: accounts.createdAt,
            deletedAt: accounts.deletedAt,
        })
        .from(accounts)
        .orderBy(accounts.createdAt);

    info(`Total accounts in database: ${allAccounts.length}`);
    allAccounts.forEach((acc) => {
        const deleted = acc.deletedAt ? " [DELETED]" : "";
        console.log(
            `  - ${acc.name}${deleted} (${acc.id}) - Created: ${acc.createdAt}`
        );
    });

    const allUsers = await db
        .select({
            id: users.id,
            email: users.email,
            accountId: users.accountId,
            createdAt: users.createdAt,
            deletedAt: users.deletedAt,
        })
        .from(users)
        .orderBy(users.createdAt)
        .limit(50); // Limit to avoid too much output

    info(`Showing first 50 users in database (total may be more)`);
    allUsers.forEach((user) => {
        const deleted = user.deletedAt ? " [DELETED]" : "";
        console.log(
            `  - ${user.email}${deleted} (${user.id}) - Account: ${user.accountId} - Created: ${user.createdAt}`
        );
    });
}

/**
 * Cleanup test data
 */
async function cleanupTestData(showDebug = false) {
    section("Finding Test Data");

    // Show all accounts/users for debugging if requested
    if (showDebug) {
        await listAllAccountsAndUsers();
    }

    // Find test accounts
    const testAccounts = await findTestAccounts();
    info(`Found ${testAccounts.length} test account(s)`);

    if (testAccounts.length === 0) {
        warn("No test accounts found matching patterns:");
        warn("  - Names starting with 'RLS Test Account'");
        warn("  - Names starting with 'rls-test-account'");
        warn("  - Names containing 'RLS Test'");
        warn("  - Names containing 'test account'");
        warn("\nUse --debug flag to see all accounts/users in database");
        return;
    }

    const accountIds = testAccounts.map((a) => a.id);
    testAccounts.forEach((acc) => {
        const deleted = (acc as any).deletedAt ? " [DELETED]" : "";
        info(`  - ${acc.name}${deleted} (${acc.id})`);
    });

    // Find test users
    const testUsers = await findTestUsers();
    info(`Found ${testUsers.length} test user(s)`);
    testUsers.forEach((user) => {
        const deleted = (user as any).deletedAt ? " [DELETED]" : "";
        info(`  - ${user.email}${deleted} (${user.id})`);
    });
    const userIds = testUsers.map((u) => u.id);

    section("Cleaning Up Test Data");

    try {
        // Delete in reverse order of dependencies

        // 1. Delete role assignments
        if (userIds.length > 0) {
            const deletedRoleUsers = await db
                .delete(roleUsers)
                .where(inArray(roleUsers.userId, userIds));
            info(`Deleted role user assignments`);
        }

        // 2. Find all roles for test accounts
        const testRoles = await db
            .select({
                id: roles.id,
                name: roles.name,
                accountId: roles.accountId,
            })
            .from(roles)
            .where(inArray(roles.accountId, accountIds));
        const roleIds = testRoles.map((r) => r.id);
        info(`Found ${roleIds.length} role(s) for test accounts`);

        // 3. Find all permissions for test accounts
        const testPermissions = await db
            .select({ id: permissions.id })
            .from(permissions)
            .where(inArray(permissions.accountId, accountIds));
        const permissionIds = testPermissions.map((p) => p.id);
        info(`Found ${permissionIds.length} permission(s) for test accounts`);

        // 4. Delete permission-role mappings
        // Delete mappings that reference test account roles OR permissions
        if (roleIds.length > 0 || permissionIds.length > 0) {
            const conditions = [];
            if (roleIds.length > 0) {
                conditions.push(inArray(permissionRoles.roleId, roleIds));
            }
            if (permissionIds.length > 0) {
                conditions.push(
                    inArray(permissionRoles.permissionId, permissionIds)
                );
            }

            if (conditions.length > 0) {
                const deletedMappings = await db
                    .delete(permissionRoles)
                    .where(or(...conditions));
                info(`Deleted permission-role mappings`);
            }
        }

        // 5. Delete roles
        if (roleIds.length > 0) {
            await db.delete(roles).where(inArray(roles.id, roleIds));
            info(`Deleted ${roleIds.length} role(s)`);
        }

        // 6. Delete permissions for test accounts
        if (permissionIds.length > 0) {
            await db
                .delete(permissions)
                .where(inArray(permissions.id, permissionIds));
            info(`Deleted ${permissionIds.length} permission(s)`);
        }

        // 7. Delete user invitations
        const deletedInvitations = await db
            .delete(userInvitations)
            .where(inArray(userInvitations.accountId, accountIds));
        info(`Deleted user invitations`);

        // 8. Delete user preferences
        if (userIds.length > 0) {
            await db
                .delete(userPreferences)
                .where(inArray(userPreferences.userId, userIds));
            info(`Deleted user preferences`);
        }

        // 9. Delete user profiles
        if (userIds.length > 0) {
            await db
                .delete(userProfiles)
                .where(inArray(userProfiles.userId, userIds));
            info(`Deleted user profiles`);
        }

        // 10. Delete credit balances
        await db
            .delete(creditBalances)
            .where(inArray(creditBalances.accountId, accountIds));
        info(`Deleted credit balances`);

        // 11. Delete credit ledger entries
        await db
            .delete(creditLedger)
            .where(inArray(creditLedger.accountId, accountIds));
        info(`Deleted credit ledger entries`);

        // 12. Delete usage counters
        await db
            .delete(usageCounters)
            .where(inArray(usageCounters.accountId, accountIds));
        info(`Deleted usage counters`);

        // 13. Delete usage events
        await db
            .delete(usageEvents)
            .where(inArray(usageEvents.accountId, accountIds));
        info(`Deleted usage events`);

        // 14. Delete usage metrics (by user_id)
        if (userIds.length > 0) {
            await db
                .delete(usageMetrics)
                .where(inArray(usageMetrics.userId, userIds));
            info(`Deleted usage metrics`);
        }

        // 15. Delete subscription items
        const testSubscriptions = await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(inArray(subscriptions.accountId, accountIds));
        const subscriptionIds = testSubscriptions.map((s) => s.id);
        info(
            `Found ${subscriptionIds.length} subscription(s) for test accounts`
        );

        if (subscriptionIds.length > 0) {
            await db
                .delete(subscriptionItems)
                .where(
                    inArray(subscriptionItems.subscriptionId, subscriptionIds)
                );
            info(`Deleted subscription items`);
        }

        // 16. Delete subscriptions
        if (subscriptionIds.length > 0) {
            await db
                .delete(subscriptions)
                .where(inArray(subscriptions.id, subscriptionIds));
            info(`Deleted ${subscriptionIds.length} subscription(s)`);
        }

        // 17. Delete notifications
        await db
            .delete(notifications)
            .where(inArray(notifications.accountId, accountIds));
        info(`Deleted notifications`);

        // 18. Delete audit logs
        await db
            .delete(auditLogs)
            .where(inArray(auditLogs.accountId, accountIds));
        info(`Deleted audit logs`);

        // 19. Delete users
        if (userIds.length > 0) {
            await db.delete(users).where(inArray(users.id, userIds));
            info(`Deleted ${userIds.length} user(s)`);

            // Delete auth users from Supabase
            let deletedAuthUsers = 0;
            for (const userId of userIds) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(userId);
                    deletedAuthUsers++;
                } catch (err: any) {
                    warn(
                        `Could not delete auth user ${userId}: ${err.message}`
                    );
                }
            }
            info(
                `Deleted ${deletedAuthUsers}/${userIds.length} auth users from Supabase`
            );
        }

        // 20. Delete accounts (last, as everything depends on them)
        await db.delete(accounts).where(inArray(accounts.id, accountIds));
        info(`Deleted ${accountIds.length} account(s)`);

        // Verify cleanup
        section("Verifying Cleanup");
        const remainingAccounts = await findTestAccounts();
        const remainingUsers = await findTestUsers();

        if (remainingAccounts.length > 0) {
            warn(
                `Warning: ${remainingAccounts.length} test account(s) still exist:`
            );
            remainingAccounts.forEach((acc) => {
                warn(`  - ${acc.name} (${acc.id})`);
            });
        }

        if (remainingUsers.length > 0) {
            warn(`Warning: ${remainingUsers.length} test user(s) still exist:`);
            remainingUsers.forEach((user) => {
                warn(`  - ${user.email} (${user.id})`);
            });
        }

        if (remainingAccounts.length === 0 && remainingUsers.length === 0) {
            success("All test data cleaned up successfully");
        } else {
            warn("Some test data may still exist. Check warnings above.");
        }
    } catch (err: any) {
        error(`Cleanup failed: ${err.message}`);
        console.error(err);
        throw err;
    }
}

/**
 * Main function
 */
async function main() {
    console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║        Remove RLS Test Data Script                          ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}`);

    // Check for --debug flag
    const showDebug =
        process.argv.includes("--debug") || process.argv.includes("-d");

    try {
        await cleanupTestData(showDebug);
        process.exit(0);
    } catch (err: any) {
        error(`Script failed: ${err.message}`);
        console.error(err);
        process.exit(1);
    } finally {
        await dbClient.end();
    }
}

// Run cleanup
main();
