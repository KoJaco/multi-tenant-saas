#!/usr/bin/env tsx
/**
 * Cleanup Soft-Deleted Records Script
 *
 * Permanently deletes soft-deleted records older than the configured retention period.
 * Use with caution - this performs hard deletes.
 *
 * Usage:
 *   tsx scripts/cleanup-soft-deletes.ts [--dry-run]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../app/lib/db/schema.js";
import {
    users,
    accounts,
    roles,
    permissions,
    userInvitations,
    notifications,
} from "../app/lib/db/schema.js";
import { serverConfig } from "../app/lib/config.server.js";
import { lt, and, isNotNull, sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function cleanupSoftDeletes() {
    console.log("\n🧹 Cleaning up old soft-deleted records...\n");

    if (DRY_RUN) {
        console.log("⚠️  DRY RUN MODE - No records will be deleted\n");
    }

    const retentionDays = serverConfig.SOFT_DELETE_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`Retention period: ${retentionDays} days`);
    console.log(`Cutoff date: ${cutoffDate.toISOString()}\n`);

    const client = postgres(serverConfig.DATABASE_URL, { max: 1 });
    const db = drizzle(client, { schema });

    try {
        const tables = [
            { name: "users", table: users },
            { name: "accounts", table: accounts },
            { name: "roles", table: roles },
            { name: "permissions", table: permissions },
            { name: "user_invitations", table: userInvitations },
            { name: "notifications", table: notifications },
        ];

        let totalDeleted = 0;

        for (const { name, table } of tables) {
            try {
                // Count records to be deleted
                const countResult = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(table)
                    .where(
                        and(
                            isNotNull((table as any).deletedAt),
                            lt((table as any).deletedAt, cutoffDate)
                        )
                    );

                const count = Number(countResult[0]?.count || 0);

                if (count === 0) {
                    console.log(`  ${name}: 0 records to delete`);
                    continue;
                }

                console.log(`  ${name}: ${count} record(s) to delete`);

                if (!DRY_RUN) {
                    // Hard delete old soft-deleted records
                    await db
                        .delete(table)
                        .where(
                            and(
                                isNotNull((table as any).deletedAt),
                                lt((table as any).deletedAt, cutoffDate)
                            )
                        );

                    console.log(`    ✅ Deleted ${count} record(s)`);
                    totalDeleted += count;
                }
            } catch (error: any) {
                console.error(`    ❌ Error cleaning up ${name}:`, error.message);
            }
        }

        if (DRY_RUN) {
            console.log("\n⚠️  DRY RUN - No records were actually deleted");
            console.log("Run without --dry-run to perform deletion\n");
        } else {
            console.log(`\n✅ Cleanup complete. Deleted ${totalDeleted} record(s) total\n`);
        }
    } catch (error: any) {
        console.error("❌ Error during cleanup:", error.message);
        throw error;
    } finally {
        await client.end();
    }
}

cleanupSoftDeletes().catch((error) => {
    console.error(error);
    process.exit(1);
});

