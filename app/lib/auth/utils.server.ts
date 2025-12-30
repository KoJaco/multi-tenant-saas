/**
 * Authentication Utilities
 *
 * Shared utilities for authentication routes to reduce code duplication
 */

import {
    createServerClient,
    parseCookieHeader,
    serializeCookieHeader,
} from "@supabase/ssr";
import { getSession, commitSession } from "~/lib/cookies.server";
import { db } from "~/lib/db/index.server";
import {
    accounts,
    users,
    roles,
    permissions,
    permissionRoles,
    roleUsers,
    entityEnum,
    actionEnum,
} from "~/lib/db/schema";
import type { AppUser, Action } from "../db/types";

/**
 * Creates a Supabase client for authentication routes
 * Handles cookie parsing and session management consistently
 */
export async function createAuthSupabaseClient(request: Request) {
    const session = await getSession(request);
    const headers = new Headers();
    const cookieHeader = request.headers.get("Cookie");

    const supabase = createServerClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                get(name: string) {
                    const cookies = parseCookieHeader(cookieHeader ?? "");
                    const cookie = cookies.find((c) => c.name === name);
                    return cookie?.value;
                },
                set(name: string, value: string, options: any) {
                    const cookieString = serializeCookieHeader(
                        name,
                        value,
                        options
                    );
                    headers.append("Set-Cookie", cookieString);
                },
                remove(name: string, options: any) {
                    const cookieString = serializeCookieHeader(name, "", {
                        ...options,
                        maxAge: 0,
                    });
                    headers.append("Set-Cookie", cookieString);
                },
            },
        }
    );

    // Commit session cookie
    const sessionCookie = await commitSession(session);
    headers.append("Set-Cookie", sessionCookie);

    return { supabase, headers };
}

/**
 * Gets the appropriate actions for an entity
 * audit_logs is read-only and can only have "retrieve" action
 */
function getEntityActions(entity: string): Action[] {
    if (entity === "audit_logs") {
        return ["retrieve"];
    }
    return actionEnum.enumValues as Action[];
}

/**
 * Gets the description for a permission based on the entity
 */
function getPermissionDescription(entity: string): string {
    if (entity === "audit_logs") {
        return "Read-only access to audit logs";
    }
    return `Full access to ${entity}`;
}

/**
 * Initializes a new account with default roles and permissions
 * This should be wrapped in a transaction when called
 */
export async function initializeAccount(
    accountId: string,
    userId: string
): Promise<void> {
    // Create default roles
    const [ownerRole] = await db
        .insert(roles)
        .values({
            name: "Owner",
            description: "Account owner with full access",
            accessLevel: 2,
            accountId,
        })
        .returning();

    const [adminRole] = await db
        .insert(roles)
        .values({
            name: "Admin",
            description: "Administrator with elevated access",
            accessLevel: 1,
            accountId,
        })
        .returning();

    const [userRole] = await db
        .insert(roles)
        .values({
            name: "User",
            description: "Regular user with basic access",
            accessLevel: 0,
            accountId,
        })
        .returning();

    // Create default permissions for each entity
    const entities = entityEnum.enumValues;

    const createdPermissions: any[] = [];

    for (const entity of entities) {
        const entityActions = getEntityActions(entity);
        const [permission] = await db
            .insert(permissions)
            .values({
                entity,
                actions: entityActions,
                description: getPermissionDescription(entity),
                accountId,
                isCritical:
                    entity === "roles" ||
                    entity === "permissions" ||
                    entity === "users" ||
                    entity === "billing" ||
                    entity === "subscriptions" ||
                    entity === "account" ||
                    entity === "audit_logs",
                isOwnerOnly: true,
            })
            .returning();

        createdPermissions.push(permission);

        // Assign permission to owner role
        await db.insert(permissionRoles).values({
            roleId: ownerRole.id,
            permissionId: permission.id,
        });
    }

    // Assign user to owner role
    await db.insert(roleUsers).values({
        userId,
        roleId: ownerRole.id,
        assignedBy: userId, // User is self-assigned as owner
    });
}

/**
 * Creates a new account and initializes it with roles/permissions
 * Wraps in transaction to ensure atomicity
 */
export async function createAccountWithUser(
    accountName: string,
    userId: string,
    userEmail: string,
    provider: string = "email",
    providerId?: string,
    emailVerified: boolean = false
): Promise<{ user: AppUser }> {
    return await db.transaction(async (tx) => {
        // Create account
        const [account] = await tx
            .insert(accounts)
            .values({
                name: accountName,
                plan: "free",
            })
            .returning();

        // Initialize account (roles, permissions)
        // We need to use the transaction context, so we'll inline the logic here
        const [ownerRole] = await tx
            .insert(roles)
            .values({
                name: "Owner",
                description: "Account owner with full access",
                accessLevel: 2,
                accountId: account.id,
            })
            .returning();

        const [adminRole] = await tx
            .insert(roles)
            .values({
                name: "Admin",
                description: "Administrator with elevated access",
                accessLevel: 1,
                accountId: account.id,
            })
            .returning();

        const [userRole] = await tx
            .insert(roles)
            .values({
                name: "User",
                description: "Regular user with basic access",
                accessLevel: 0,
                accountId: account.id,
            })
            .returning();

        // Create permissions
        const entities = entityEnum.enumValues;

        for (const entity of entities) {
            const entityActions = getEntityActions(entity);
            const [permission] = await tx
                .insert(permissions)
                .values({
                    entity,
                    actions: entityActions,
                    description: getPermissionDescription(entity),
                    accountId: account.id,
                    isCritical:
                        entity === "roles" ||
                        entity === "permissions" ||
                        entity === "users" ||
                        entity === "billing" ||
                        entity === "subscriptions" ||
                        entity === "account" ||
                        entity === "audit_logs",
                    isOwnerOnly: true,
                })
                .returning();

            // Assign permission to owner role
            await tx.insert(permissionRoles).values({
                roleId: ownerRole.id,
                permissionId: permission.id,
            });
        }

        // Create user record
        const [insertedUser] = await tx
            .insert(users)
            .values({
                id: userId,
                email: userEmail,
                provider,
                providerId: providerId || userEmail,
                accountId: account.id,
                role: "owner",
                emailVerified: emailVerified,
            })
            .returning();

        // Assign user to owner role
        await tx.insert(roleUsers).values({
            userId,
            roleId: ownerRole.id,
            assignedBy: userId,
        });

        return { user: insertedUser };
    });
}
