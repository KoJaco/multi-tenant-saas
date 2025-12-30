#!/usr/bin/env tsx
/**
 * Database Seeding Script
 *
 * This script seeds the database with test data:
 * - 3 test accounts
 * - Users with different roles per account
 * - Roles (Admin, Manager, Viewer) per account
 * - Permissions for common entities
 * - Role assignments
 * - Sample invitations
 * - Sample credit balances
 *
 * Usage:
 *   tsx scripts/seed-database.ts
 *   or
 *   npm run seed (if added to package.json)
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
    userInvitations,
    creditBalances,
    entityEnum,
    actionEnum,
} from "../app/lib/db/schema.js";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

// Environment variables check
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}

if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL environment variable is required");
}

if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY environment variable is required");
}

// Initialize clients
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
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

// Test data configuration
const TEST_ACCOUNTS = [
    {
        name: "Acme Corporation",
        plan: "pro",
        users: [
            {
                email: "alice@acme.com",
                role: "owner" as const,
                name: "Alice Owner",
            },
            {
                email: "bob@acme.com",
                role: "admin" as const,
                name: "Bob Admin",
            },
            {
                email: "charlie@acme.com",
                role: "user" as const,
                name: "Charlie User",
            },
        ],
    },
    {
        name: "TechStart Inc",
        plan: "free",
        users: [
            {
                email: "david@techstart.com",
                role: "owner" as const,
                name: "David Owner",
            },
            {
                email: "eve@techstart.com",
                role: "admin" as const,
                name: "Eve Admin",
            },
        ],
    },
    {
        name: "Global Solutions",
        plan: "free",
        users: [
            {
                email: "frank@global.com",
                role: "owner" as const,
                name: "Frank Owner",
            },
            {
                email: "grace@global.com",
                role: "user" as const,
                name: "Grace User",
            },
        ],
    },
];

const CUSTOM_ROLES = [
    {
        name: "Manager",
        description: "Manager with elevated permissions",
        accessLevel: 1,
    },
    { name: "Viewer", description: "Read-only access", accessLevel: 0 },
];

async function createAuthUser(email: string, password: string = "password123") {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (error) {
        // If user already exists, try to get them
        if (error.message.includes("already registered")) {
            const { data: existing } =
                await supabaseAdmin.auth.admin.listUsers();
            const user = existing?.users.find((u) => u.email === email);
            if (user) {
                return { user, isNew: false };
            }
        }
        throw error;
    }

    return { user: data.user!, isNew: true };
}

async function main() {
    console.log("\n=== Seeding Database ===\n");

    try {
        const createdAccounts: any[] = [];
        const createdUsers: any[] = [];

        // Create accounts and users
        for (const accountData of TEST_ACCOUNTS) {
            console.log(`Creating account: ${accountData.name}...`);

            // Create account
            const [account] = await db
                .insert(accounts)
                .values({
                    name: accountData.name,
                    plan: accountData.plan,
                })
                .returning();

            createdAccounts.push(account);
            console.log(`  ✓ Account created: ${account.id}`);

            // Create default roles (Owner, Admin, User)
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

            // Create custom roles
            const customRoles: any[] = [];
            for (const customRoleData of CUSTOM_ROLES) {
                const [customRole] = await db
                    .insert(roles)
                    .values({
                        ...customRoleData,
                        accountId: account.id,
                    })
                    .returning();
                customRoles.push(customRole);
            }

            console.log(
                `  ✓ Created roles: Owner, Admin, User, Manager, Viewer`
            );

            // Create permissions
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
                            isCritical:
                                entity === "account" || entity === "users",
                            isOwnerOnly: entity === "account",
                        })
                        .returning();
                    createdPermissions.push(permission);
                }
            }

            // Assign all permissions to Owner role
            const ownerPermissions = createdPermissions.map((perm) => ({
                roleId: ownerRole.id,
                permissionId: perm.id,
            }));
            await db.insert(permissionRoles).values(ownerPermissions);

            // Assign retrieve permissions to Admin role
            const adminPermissions = createdPermissions
                .filter((perm) => perm.actions?.includes("retrieve"))
                .map((perm) => ({
                    roleId: adminRole.id,
                    permissionId: perm.id,
                }));
            await db.insert(permissionRoles).values(adminPermissions);

            // Assign retrieve permissions to Manager role
            const managerPermissions = createdPermissions
                .filter((perm) => perm.actions?.includes("retrieve"))
                .map((perm) => ({
                    roleId: customRoles[0].id, // Manager role
                    permissionId: perm.id,
                }));
            await db.insert(permissionRoles).values(managerPermissions);

            // Assign only retrieve permissions to Viewer role
            const viewerPermissions = createdPermissions
                .filter((perm) => perm.actions?.includes("retrieve"))
                .map((perm) => ({
                    roleId: customRoles[1].id, // Viewer role
                    permissionId: perm.id,
                }));
            await db.insert(permissionRoles).values(viewerPermissions);

            console.log(`  ✓ Created and assigned permissions`);

            // Create users
            for (const userData of accountData.users) {
                console.log(`  Creating user: ${userData.email}...`);

                // Create auth user
                const { user: authUser, isNew } = await createAuthUser(
                    userData.email,
                    "password123"
                );

                if (isNew) {
                    console.log(`    ✓ Auth user created`);
                } else {
                    console.log(`    ✓ Auth user already exists`);
                }

                // Check if user already exists in our database
                const existingUser = await db.query.users.findFirst({
                    where: eq(users.id, authUser.id),
                });

                let appUser;
                if (existingUser) {
                    // Update existing user
                    [appUser] = await db
                        .update(users)
                        .set({
                            accountId: account.id,
                            role: userData.role,
                            emailVerified: true,
                        })
                        .where(eq(users.id, authUser.id))
                        .returning();
                    console.log(`    ✓ User updated`);
                } else {
                    // Create new user
                    [appUser] = await db
                        .insert(users)
                        .values({
                            id: authUser.id,
                            email: userData.email,
                            provider: "email",
                            providerId: userData.email,
                            accountId: account.id,
                            role: userData.role,
                            emailVerified: true,
                            lastLoginAt: new Date(),
                        })
                        .returning();
                    console.log(`    ✓ User created`);
                }

                createdUsers.push({ ...appUser, accountId: account.id });

                // Assign role based on user role
                let roleToAssign;
                switch (userData.role) {
                    case "owner":
                        roleToAssign = ownerRole;
                        break;
                    case "admin":
                        roleToAssign = adminRole;
                        break;
                    case "user":
                        roleToAssign = userRole;
                        break;
                }

                // Check if role assignment already exists
                const existingAssignment = await db.query.roleUsers.findFirst({
                    where: (roleUsers, { eq, and }) =>
                        and(
                            eq(roleUsers.userId, appUser.id),
                            eq(roleUsers.roleId, roleToAssign.id)
                        ),
                });

                if (!existingAssignment) {
                    await db.insert(roleUsers).values({
                        userId: appUser.id,
                        roleId: roleToAssign.id,
                        assignedBy: appUser.id,
                    });
                    console.log(`    ✓ Assigned ${roleToAssign.name} role`);
                }
            }

            // Create credit balance
            await db.insert(creditBalances).values({
                accountId: account.id,
                minuteCredits: accountData.plan === "pro" ? 1000 : 100,
                claimCredits: accountData.plan === "pro" ? 500 : 50,
            });

            console.log(`  ✓ Credit balance created`);

            // Create sample invitations (for first account only)
            if (accountData.name === TEST_ACCOUNTS[0].name) {
                const ownerUser = createdUsers.find(
                    (u) => u.accountId === account.id && u.role === "owner"
                );

                if (ownerUser) {
                    const invitations = [
                        {
                            email: "invited1@acme.com",
                            roleId: adminRole.id,
                        },
                        {
                            email: "invited2@acme.com",
                            roleId: userRole.id,
                        },
                    ];

                    for (const invData of invitations) {
                        const token = nanoid(32);
                        await db.insert(userInvitations).values({
                            accountId: account.id,
                            email: invData.email,
                            roleId: invData.roleId,
                            token,
                            invitedBy: ownerUser.id,
                            expiresAt: new Date(
                                Date.now() + 7 * 24 * 60 * 60 * 1000
                            ), // 7 days
                            status: "pending",
                        });
                    }

                    console.log(
                        `  ✓ Created ${invitations.length} sample invitations`
                    );
                }
            }

            console.log("");
        }

        // Summary
        console.log("=== Seeding Complete! ===\n");
        console.log(`Created:`);
        console.log(`  - ${createdAccounts.length} accounts`);
        console.log(`  - ${createdUsers.length} users`);
        console.log(`  - Multiple roles per account`);
        console.log(`  - Permissions and role assignments`);
        console.log(`  - Credit balances`);
        console.log(`  - Sample invitations\n`);

        console.log("Test credentials (all passwords: password123):");
        for (const accountData of TEST_ACCOUNTS) {
            console.log(`\n${accountData.name}:`);
            for (const userData of accountData.users) {
                console.log(`  - ${userData.email} (${userData.role})`);
            }
        }

        console.log("\nYou can now log in at: /login\n");
    } catch (error: any) {
        console.error("\n❌ Error:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
