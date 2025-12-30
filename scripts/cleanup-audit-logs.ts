#!/usr/bin/env tsx
/**
 * Cleanup Audit Logs Script
 *
 * Removes audit logs older than the configured retention period.
 * Run this periodically (e.g., via cron) to maintain compliance.
 *
 * Usage:
 *   tsx scripts/cleanup-audit-logs.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../app/lib/db/schema.js";
import { auditLogs } from "../app/lib/db/schema.js";
import { serverConfig } from "../app/lib/config.server.js";
import { lt, sql } from "drizzle-orm";

async function cleanupAuditLogs() {
    console.log("\n🧹 Cleaning up old audit logs...\n");

    const retentionDays = serverConfig.AUDIT_LOG_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`Retention period: ${retentionDays} days`);
    console.log(`Cutoff date: ${cutoffDate.toISOString()}\n`);

    const client = postgres(serverConfig.DATABASE_URL, { max: 1 });
    const db = drizzle(client, { schema });

    try {
        // Count records to be deleted
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(auditLogs)
            .where(lt(auditLogs.createdAt, cutoffDate));

        const count = Number(countResult[0]?.count || 0);

        if (count === 0) {
            console.log("✅ No audit logs to clean up\n");
            return;
        }

        console.log(
            `Found ${count} audit logs older than ${retentionDays} days`
        );

        // Delete old audit logs
        const result = await db
            .delete(auditLogs)
            .where(lt(auditLogs.createdAt, cutoffDate));

        console.log(`✅ Deleted ${count} audit log(s)\n`);
    } catch (error: any) {
        console.error("❌ Error cleaning up audit logs:", error.message);
        throw error;
    } finally {
        await client.end();
    }
}

cleanupAuditLogs().catch((error) => {
    console.error(error);
    process.exit(1);
});
