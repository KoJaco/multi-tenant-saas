#!/usr/bin/env tsx
/**
 * Create Superuser Account Script
 *
 * This script creates a new superuser account with:
 * - Supabase auth user
 * - Account record
 * - User record with owner role
 * - Initial credit balance
 * - Default roles and permissions
 *
 * Usage:
 *   tsx scripts/create-superuser.ts
 *   or
 *   npm run create-superuser (if added to package.json)
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
    permissionRoles,
    roleUsers,
    creditBalances,
    entityEnum,
    actionEnum,
} from "../app/lib/db/schema.js";
import * as readline from "readline";

// Environment variables check
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}

if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY environment variable is required");
}

// Initialize clients
const supabaseAdmin = createClient(
    process.env.DATABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

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

async function main() {
    console.log("\n=== Create Superuser Account ===\n");

    try {
        // Collect user input
        const email = await question("Email: ");
        if (!email || !email.includes("@")) {
            throw new Error("Valid email is required");
        }

        const password = await question("Password (min 6 characters): ");
        if (!password || password.length < 6) {
            throw new Error("Password must be at least 6 characters");
        }

        const accountName =
            (await question(
                "Account name (press Enter to use email username): "
            )) || email.split("@")[0];

        console.log("\nCreating superuser account...\n");

        // Step 1: Create Supabase auth user
        console.log("1. Creating Supabase auth user...");
        const { data: authData, error: authError } =
            await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm email
            });

        if (authError) {
            throw new Error(`Failed to create auth user: ${authError.message}`);
        }

        if (!authData.user) {
            throw new Error("Auth user creation returned no user data");
        }

        console.log(`   ✓ Auth user created: ${authData.user.id}`);

        // Step 2: Create account
        console.log("2. Creating account...");
        const [account] = await db
            .insert(accounts)
            .values({
                name: accountName,
                plan: "free",
            })
            .returning();

        console.log(`   ✓ Account created: ${account.id} (${account.name})`);

        // Step 3: Create default roles
        console.log("3. Creating default roles...");
        const [ownerRole] = await db
            .insert(roles)
            .values({
                name: "Owner",
                description: "Account owner with full access",
                accessLevel: 2,
                accountId: account.id,
            })
            .returning();

        const [adminRole] = await db
            .insert(roles)
            .values({
                name: "Admin",
                description: "Administrator with elevated access",
                accessLevel: 1,
                accountId: account.id,
            })
            .returning();

        const [userRole] = await db
            .insert(roles)
            .values({
                name: "User",
                description: "Regular user with basic access",
                accessLevel: 0,
                accountId: account.id,
            })
            .returning();

        console.log(`   ✓ Created roles: Owner, Admin, User`);

        // Step 4: Create default permissions
        console.log("4. Creating default permissions...");
        const entities = entityEnum.enumValues;
        const actions = actionEnum.enumValues;
        const createdPermissions: any[] = [];

        for (const entity of entities) {
            for (const action of actions) {
                const [permission] = await db
                    .insert(permissions)
                    .values({
                        accountId: account.id,
                        entity: entity,
                        actions: [action],
                        description: `${action} ${entity}`,
                        isCritical: entity === "account" || entity === "users",
                        isOwnerOnly: entity === "account",
                    })
                    .returning();
                createdPermissions.push(permission);
            }
        }

        console.log(`   ✓ Created ${createdPermissions.length} permissions`);

        // Step 5: Assign all permissions to Owner role
        console.log("5. Assigning permissions to Owner role...");
        const ownerPermissions = createdPermissions.map((perm) => ({
            roleId: ownerRole.id,
            permissionId: perm.id,
        }));

        await db.insert(permissionRoles).values(ownerPermissions);
        console.log(
            `   ✓ Assigned ${ownerPermissions.length} permissions to Owner role`
        );

        // Step 6: Create user record
        console.log("6. Creating user record...");
        const [appUser] = await db
            .insert(users)
            .values({
                id: authData.user.id,
                email,
                provider: "email",
                providerId: email,
                accountId: account.id,
                role: "owner",
                emailVerified: true,
                lastLoginAt: new Date(),
            })
            .returning();

        console.log(`   ✓ User record created: ${appUser.id}`);

        // Step 7: Assign Owner role to user
        console.log("7. Assigning Owner role to user...");
        await db.insert(roleUsers).values({
            userId: appUser.id,
            roleId: ownerRole.id,
            assignedBy: appUser.id,
        });

        console.log(`   ✓ Owner role assigned`);

        // Step 8: Create initial credit balance
        console.log("8. Creating initial credit balance...");
        await db.insert(creditBalances).values({
            accountId: account.id,
            minuteCredits: 0,
            claimCredits: 0,
        });

        console.log(`   ✓ Credit balance initialized`);

        // Success summary
        console.log("\n=== Success! ===\n");
        console.log("Superuser account created successfully:\n");
        console.log(`  Email:        ${email}`);
        console.log(`  Account ID:  ${account.id}`);
        console.log(`  Account Name: ${account.name}`);
        console.log(`  User ID:     ${appUser.id}`);
        console.log(`  Role:        Owner`);
        console.log("\nYou can now log in at: /login\n");
    } catch (error: any) {
        console.error("\n❌ Error:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        rl.close();
        await client.end();
    }
}

main();
