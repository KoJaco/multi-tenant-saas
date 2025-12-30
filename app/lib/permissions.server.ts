import { db } from "~/lib/db/index.server";
import {
    users,
    roles,
    permissions,
    permissionRoles,
    roleUsers,
} from "~/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { requireUser } from "~/lib/auth/auth.server";
import { redirect } from "react-router";
import { isNotDeleted } from "~/lib/db/soft-delete.server";
import type { Entity as EntityType } from "~/lib/db/types";

type ActionType = "create" | "retrieve" | "update" | "delete";

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
    userId: string,
    entity: EntityType,
    action: ActionType
): Promise<boolean> {
    // First get the user's accountId to ensure we only check permissions in the same account
    const [user] = await db
        .select({ accountId: users.accountId })
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)));

    if (!user) return false;

    // Get user's roles and their permissions, filtered by accountId and excluding deleted records
    const userPermissions = await db
        .select({
            entity: permissions.entity,
            actions: permissions.actions,
            isOwnerOnly: permissions.isOwnerOnly,
            accountId: permissions.accountId,
        })
        .from(roleUsers)
        .innerJoin(roles, eq(roleUsers.roleId, roles.id))
        .innerJoin(permissionRoles, eq(roles.id, permissionRoles.roleId))
        .innerJoin(
            permissions,
            eq(permissionRoles.permissionId, permissions.id)
        )
        .where(
            and(
                eq(roleUsers.userId, userId),
                isNotDeleted(roleUsers),
                eq(roles.accountId, user.accountId),
                isNotDeleted(roles),
                eq(permissions.accountId, user.accountId),
                isNotDeleted(permissions),
                isNotDeleted(permissionRoles)
            )
        );

    // Check if user has the specific permission
    return userPermissions.some(
        (perm) => perm.entity === entity && perm.actions?.includes(action)
    );
}

/**
 * Check if user is owner (always has all permissions)
 */
export async function isOwner(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)));

    return user?.role === "owner";
}

/**
 * Get user's effective access level
 */
export async function getUserAccessLevel(userId: string): Promise<number> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)));

    // Map simple roles to access levels
    switch (user?.role) {
        case "owner":
            return 2;
        case "admin":
            return 1;
        case "user":
            return 0;
        default:
            return -1; // No access
    }
}

/**
 * Get role's access level from the roles table
 */
export async function getRoleAccessLevel(roleId: string): Promise<number> {
    const [role] = await db
        .select({ accessLevel: roles.accessLevel })
        .from(roles)
        .where(and(eq(roles.id, roleId), isNotDeleted(roles)));

    return role?.accessLevel ?? -1;
}

/**
 * Check if a user can manage a specific role (hierarchy check)
 */
export async function canManageRole(
    currentUserId: string,
    targetRoleId: string
): Promise<boolean> {
    // Get current user's accountId and level
    const [currentUser] = await db
        .select({ accountId: users.accountId, role: users.role })
        .from(users)
        .where(and(eq(users.id, currentUserId), isNotDeleted(users)));

    if (!currentUser) return false;

    const currentUserLevel = await getUserAccessLevel(currentUserId);

    // Get the target role's access level and accountId
    const [targetRole] = await db
        .select({ accessLevel: roles.accessLevel, accountId: roles.accountId })
        .from(roles)
        .where(and(eq(roles.id, targetRoleId), isNotDeleted(roles)));

    if (!targetRole) return false;

    // Must be in the same account
    if (targetRole.accountId !== currentUser.accountId) return false;

    // Can't manage roles with equal or higher access levels
    return currentUserLevel > targetRole.accessLevel;
}

/**
 * Check if a user can assign a specific role to another user
 */
export async function canAssignRole(
    currentUserId: string,
    targetRoleId: string,
    targetUserId: string
): Promise<boolean> {
    const currentUserLevel = await getUserAccessLevel(currentUserId);
    const targetRoleLevel = await getRoleAccessLevel(targetRoleId);

    // Can't assign roles with access levels higher than or equal to current user
    if (currentUserLevel <= targetRoleLevel) {
        return false;
    }

    // Special case for invitations (targetUserId is "invitation")
    if (targetUserId === "invitation") {
        return true; // Can assign to invitations if role level is appropriate
    }

    const targetUserLevel = await getUserAccessLevel(targetUserId);

    // Can't assign roles to users with equal or higher access levels
    if (currentUserLevel <= targetUserLevel) {
        return false;
    }

    // Can't assign roles to yourself
    if (currentUserId === targetUserId) {
        return false;
    }

    return true;
}

/**
 * Check if a role is protected (owner role or system role)
 */
export async function isProtectedRole(roleId: string): Promise<boolean> {
    const [role] = await db
        .select({ name: roles.name, accessLevel: roles.accessLevel })
        .from(roles)
        .where(and(eq(roles.id, roleId), isNotDeleted(roles)));

    // Owner-level roles (access level 2) are protected
    return role?.accessLevel === 2;
}

/**
 * Check if a user is protected (owner role)
 */
export async function isProtectedUser(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)));

    return user?.role === "owner";
}

/**
 * Middleware: Require specific permission(s)
 * @param request - The incoming request
 * @param entity - The entity type to check permissions for
 * @param action - Single action or array of actions. If array, user must have ALL actions.
 *
 * @example
 * // Require single permission
 * const { appUser } = await requirePermission(request, "apps", "retrieve");
 *
 * // Require multiple permissions (user must have ALL)
 * const { appUser } = await requirePermission(request, "apps", ["retrieve", "update"]);
 *
 * // Require multiple permissions for different entities
 * const { appUser } = await requirePermission(request, "apps", ["retrieve", "update"]);
 * const { appUser: userPerms } = await requirePermission(request, "users", ["retrieve"]);
 */
export async function requirePermission(
    request: Request,
    entity: EntityType,
    action: ActionType | ActionType[]
) {
    const { appUser } = await requireUser(request);

    // Owners always have access
    if (await isOwner(appUser.id)) {
        return { appUser };
    }

    // Convert single action to array for consistent handling
    const actions = Array.isArray(action) ? action : [action];

    // Check if user has ALL required permissions
    const hasAllPermissions = await Promise.all(
        actions.map((actionItem) =>
            hasPermission(appUser.id, entity, actionItem)
        )
    );

    if (!hasAllPermissions.every(Boolean)) {
        // Capture the current URL for the 403 page
        const url = new URL(request.url);
        const currentPath = url.pathname + url.search;

        // Redirect to 403 page with the current path as referrer
        const searchParams = new URLSearchParams({
            from: currentPath,
            entity,
            action: actions.join(","),
        });

        throw redirect(`/403?${searchParams.toString()}`);
    }

    return { appUser };
}

/**
 * Middleware: Require ANY of the specified permissions (at least one)
 * @param request - The incoming request
 * @param entity - The entity type to check permissions for
 * @param actions - Array of actions. User must have at least ONE of these actions.
 *
 * @example
 * // Require any of the specified permissions
 * const { appUser } = await requireAnyPermission(request, "apps", ["retrieve", "update", "delete"]);
 *
 * // Useful for read-only access that could be granted through multiple permission paths
 * const { appUser } = await requireAnyPermission(request, "analytics", ["view_own", "view_all"]);
 */
export async function requireAnyPermission(
    request: Request,
    entity: EntityType,
    actions: ActionType[]
) {
    const { appUser } = await requireUser(request);

    // Owners always have access
    if (await isOwner(appUser.id)) {
        return { appUser };
    }

    // Check if user has ANY of the required permissions
    const hasAnyPermission = await Promise.all(
        actions.map((action) => hasPermission(appUser.id, entity, action))
    );

    if (!hasAnyPermission.some(Boolean)) {
        // Capture the current URL for the 403 page
        const url = new URL(request.url);
        const currentPath = url.pathname + url.search;

        // Redirect to 403 page with the current path as referrer
        const searchParams = new URLSearchParams({
            from: currentPath,
            entity,
            action: actions.join(","),
        });

        throw redirect(`/403?${searchParams.toString()}`);
    }

    return { appUser };
}

/**
 * Middleware: Require minimum access level
 */
export async function requireAccessLevel(
    request: Request,
    minLevel: number // 0: user, 1: admin, 2: owner
) {
    const { appUser } = await requireUser(request);
    const userLevel = await getUserAccessLevel(appUser.id);

    if (userLevel < minLevel) {
        // Capture the current URL for the 403 page
        const url = new URL(request.url);
        const currentPath = url.pathname + url.search;

        const levelNames = ["user", "admin", "owner"];
        const requiredLevel = levelNames[minLevel];

        // Redirect to 403 page with the current path as referrer
        const searchParams = new URLSearchParams({
            from: currentPath,
            entity: "system",
            action: `requires_${requiredLevel}_access`,
        });

        throw redirect(`/403?${searchParams.toString()}`);
    }

    return { appUser };
}

/**
 * Middleware: Owner only
 */
export async function requireOwner(request: Request) {
    return requireAccessLevel(request, 2);
}

/**
 * Middleware: Admin or Owner
 */
export async function requireAdminOrOwner(request: Request) {
    return requireAccessLevel(request, 1);
}

/**
 * Get all permissions for a user (for UI display)
 */
export async function getUserPermissions(userId: string) {
    // Get user's accountId to filter permissions
    const [user] = await db
        .select({ accountId: users.accountId })
        .from(users)
        .where(and(eq(users.id, userId), isNotDeleted(users)));

    if (!user) return [];

    return await db
        .select({
            entity: permissions.entity,
            actions: permissions.actions,
            description: permissions.description,
        })
        .from(roleUsers)
        .innerJoin(roles, eq(roleUsers.roleId, roles.id))
        .innerJoin(permissionRoles, eq(roles.id, permissionRoles.roleId))
        .innerJoin(
            permissions,
            eq(permissionRoles.permissionId, permissions.id)
        )
        .where(
            and(
                eq(roleUsers.userId, userId),
                isNotDeleted(roleUsers),
                eq(roles.accountId, user.accountId),
                isNotDeleted(roles),
                eq(permissions.accountId, user.accountId),
                isNotDeleted(permissions),
                isNotDeleted(permissionRoles)
            )
        );
}

/**
 * Check if user can manage another user (prevent privilege escalation)
 * Uses effective access levels including custom roles
 */
export async function canManageUser(
    currentUserId: string,
    targetUserId: string
): Promise<boolean> {
    const currentLevel = await getUserEffectiveAccessLevel(currentUserId);
    const targetLevel = await getUserEffectiveAccessLevel(targetUserId);

    // Can't manage someone with equal or higher privileges
    // Exception: owners can manage other owners for transfers
    if (currentLevel === 2) return true; // Owners can manage anyone
    return currentLevel > targetLevel;
}

/**
 * Get manageable roles for a user (roles they can assign)
 * Returns all roles with access levels lower than the current user's level
 */
export async function getManageableRoles(currentUserId: string) {
    // Get current user's accountId and level
    const [currentUser] = await db
        .select({ accountId: users.accountId, role: users.role })
        .from(users)
        .where(and(eq(users.id, currentUserId), isNotDeleted(users)));

    if (!currentUser) return [];

    const currentUserLevel = await getUserAccessLevel(currentUserId);

    return await db
        .select()
        .from(roles)
        .where(
            and(
                eq(roles.accountId, currentUser.accountId),
                isNotDeleted(roles),
                lt(roles.accessLevel, currentUserLevel) // All roles with lower access levels
            )
        )
        .orderBy(roles.name);
}

/**
 * Get user's effective access level including custom roles
 * Returns the highest access level from base role and assigned custom roles
 */
export async function getUserEffectiveAccessLevel(
    userId: string
): Promise<number> {
    const baseLevel = await getUserAccessLevel(userId);

    // Get the highest access level from custom roles
    const customRoleLevels = await db
        .select({ accessLevel: roles.accessLevel })
        .from(roleUsers)
        .innerJoin(roles, eq(roleUsers.roleId, roles.id))
        .where(
            and(
                eq(roleUsers.userId, userId),
                isNotDeleted(roleUsers),
                isNotDeleted(roles)
            )
        );

    // Find the maximum access level from custom roles
    const maxCustomLevel =
        customRoleLevels.length > 0
            ? Math.max(...customRoleLevels.map((r) => r.accessLevel))
            : -1;

    // Return the higher of base level and custom role level
    return Math.max(baseLevel, maxCustomLevel);
}

/**
 * Get manageable users for a user (users they can manage)
 * Returns all users with effective access levels lower than the current user's level
 */
export async function getManageableUsers(
    currentUserId: string,
    accountId: string
) {
    const currentUserLevel = await getUserEffectiveAccessLevel(currentUserId);

    // Get all users in the account
    const allUsers = await db
        .select()
        .from(users)
        .where(and(eq(users.accountId, accountId), isNotDeleted(users)));

    // Get all custom role assignments for users in this account
    const customRoleAssignments = await db
        .select({
            userId: roleUsers.userId,
            accessLevel: roles.accessLevel,
        })
        .from(roleUsers)
        .innerJoin(roles, eq(roleUsers.roleId, roles.id))
        .innerJoin(users, eq(roleUsers.userId, users.id))
        .where(
            and(
                eq(users.accountId, accountId),
                isNotDeleted(roleUsers),
                isNotDeleted(roles),
                isNotDeleted(users)
            )
        );

    // Create a map of user IDs to their maximum custom role access level
    const userCustomLevels = new Map<string, number>();
    for (const assignment of customRoleAssignments) {
        const currentMax = userCustomLevels.get(assignment.userId) ?? -1;
        userCustomLevels.set(
            assignment.userId,
            Math.max(currentMax, assignment.accessLevel)
        );
    }

    // Create a map of base role access levels
    const baseRoleLevels: Record<string, number> = {
        owner: 2,
        admin: 1,
        user: 0,
    };

    // Filter users that can be managed based on effective access level
    const manageableUsers = [];
    for (const user of allUsers) {
        // Skip self
        if (user.id === currentUserId) continue;

        // Owners can manage anyone (except themselves, already skipped)
        if (currentUserLevel === 2) {
            manageableUsers.push(user);
            continue;
        }

        // Calculate effective access level for this user
        const baseLevel = baseRoleLevels[user.role] ?? -1;
        const maxCustomLevel = userCustomLevels.get(user.id) ?? -1;
        const userEffectiveLevel = Math.max(baseLevel, maxCustomLevel);

        // Can only manage users with lower effective access levels
        if (currentUserLevel > userEffectiveLevel) {
            manageableUsers.push(user);
        }
    }

    // Sort by email
    return manageableUsers.sort((a, b) => a.email.localeCompare(b.email));
}
