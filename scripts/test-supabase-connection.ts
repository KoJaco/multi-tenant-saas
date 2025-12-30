#!/usr/bin/env tsx
/**
 * Test Supabase Connection Script
 *
 * Tests the Supabase configuration after setup:
 * - Verifies environment variables are set (DATABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY)
 * - Tests database connection
 * - Tests database schema (checks for required tables)
 *
 * Usage:
 *   tsx scripts/test-supabase-connection.ts
 *   or
 *   npm run test-supabase-connection
 */

import "dotenv/config";
import postgres from "postgres";

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

function warning(message: string) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function section(title: string) {
    console.log(`\n${colors.cyan}${title}${colors.reset}`);
    console.log("─".repeat(title.length));
}

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: string;
}

const results: TestResult[] = [];

function addResult(
    name: string,
    passed: boolean,
    message: string,
    details?: string
) {
    results.push({ name, passed, message, details });
    if (passed) {
        success(`${name}: ${message}`);
    } else {
        error(`${name}: ${message}`);
        if (details) {
            console.log(`  ${details}`);
        }
    }
}

/**
 * Check if environment variable is set
 */
function checkEnvVar(name: string, required = true): boolean {
    const value = process.env[name];
    if (!value) {
        if (required) {
            addResult(
                `Environment Variable: ${name}`,
                false,
                "Missing",
                `Required environment variable ${name} is not set`
            );
            return false;
        } else {
            addResult(
                `Environment Variable: ${name}`,
                false,
                "Not set (optional)",
                ""
            );
            return false;
        }
    }
    addResult(`Environment Variable: ${name}`, true, "Set", "");
    return true;
}

/**
 * Test database connection
 */
async function testDatabaseConnection(): Promise<boolean> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        addResult(
            "Database Connection",
            false,
            "DATABASE_URL not configured",
            ""
        );
        return false;
    }

    let client: postgres.Sql | null = null;

    try {
        // Create a connection
        client = postgres(databaseUrl, {
            max: 1, // Use only one connection for testing
            idle_timeout: 5,
            connect_timeout: 10,
        });

        // Test query
        const result =
            await client`SELECT version() as version, current_database() as database`;
        const version = result[0]?.version || "Unknown";
        const database = result[0]?.database || "Unknown";

        addResult(
            "Database Connection",
            true,
            "Connected",
            `PostgreSQL ${version.split(" ")[0]} - Database: ${database}`
        );
        return true;
    } catch (err: any) {
        addResult(
            "Database Connection",
            false,
            "Connection failed",
            err.message || "Could not connect to database"
        );
        return false;
    } finally {
        if (client) {
            await client.end();
        }
    }
}

/**
 * Test database schema (check if key tables exist)
 */
async function testDatabaseSchema(): Promise<boolean> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return false;
    }

    let client: postgres.Sql | null = null;

    try {
        client = postgres(databaseUrl, {
            max: 1,
            idle_timeout: 5,
            connect_timeout: 10,
        });

        // Check for key tables
        const tables = [
            "accounts",
            "users",
            "roles",
            "permissions",
            "permission_roles",
            "role_users",
        ];

        const existingTables: string[] = [];
        const missingTables: string[] = [];

        for (const table of tables) {
            const result = await client`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = ${table}
                ) as exists
            `;

            if (result[0]?.exists) {
                existingTables.push(table);
            } else {
                missingTables.push(table);
            }
        }

        if (missingTables.length === 0) {
            addResult(
                "Database Schema",
                true,
                "All tables exist",
                `Found ${existingTables.length} required tables`
            );
            return true;
        } else {
            addResult(
                "Database Schema",
                false,
                "Missing tables",
                `Missing: ${missingTables.join(", ")}. Run migrations first.`
            );
            return false;
        }
    } catch (err: any) {
        addResult(
            "Database Schema",
            false,
            "Check failed",
            err.message || "Could not check database schema"
        );
        return false;
    } finally {
        if (client) {
            await client.end();
        }
    }
}

/**
 * Main test function
 */
async function main() {
    console.log("\n");
    console.log(
        `${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
        `${colors.cyan}║   Supabase Connection Test                       ║${colors.reset}`
    );
    console.log(
        `${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}`
    );
    console.log("");

    // Check environment variables
    section("1. Environment Variables");
    const hasDatabaseUrl = checkEnvVar("DATABASE_URL", true);
    const hasSecretKey = checkEnvVar("SUPABASE_SECRET_KEY", true);
    const hasPublishableKey = checkEnvVar("SUPABASE_PUBLISHABLE_KEY", true);

    // Test database
    section("2. Database Connection");
    if (hasDatabaseUrl) {
        await testDatabaseConnection();
        await testDatabaseSchema();
    }

    // Summary
    section("Summary");
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    console.log(`\nTotal tests: ${total}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    if (failed > 0) {
        console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    }

    if (failed === 0) {
        console.log(
            `\n${colors.green}🎉 All tests passed! Your Supabase setup is working correctly.${colors.reset}\n`
        );
        process.exit(0);
    } else {
        console.log(
            `\n${colors.yellow}⚠️  Some tests failed. Please check the errors above.${colors.reset}`
        );
        console.log(`\n${colors.blue}Next steps:${colors.reset}`);
        console.log("  1. Verify your environment variables in .env file:");
        console.log("     - DATABASE_URL");
        console.log("     - SUPABASE_SECRET_KEY");
        console.log("     - SUPABASE_PUBLISHABLE_KEY");
        console.log(
            "  2. Run migrations if database schema test failed: npm run migrate"
        );
        console.log("");
        process.exit(1);
    }
}

// Run tests
main().catch((error) => {
    console.error(`\n${colors.red}❌ Unexpected error:${colors.reset}`);
    console.error(error);
    process.exit(1);
});
