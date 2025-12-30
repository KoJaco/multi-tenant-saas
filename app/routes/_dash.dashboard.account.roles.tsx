import {
    Form,
    Link,
    useLoaderData,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";

import {
    roles as rolesTable,
    roleUsers,
    users,
    permissions,
    permissionRoles,
} from "~/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "~/components/ui/dialog";
import { useState, useMemo } from "react";
import {
    PlusIcon,
    Shield,
    Crown,
    User,
    Settings,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X,
} from "lucide-react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";

import { Badge } from "~/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

const roleSchema = z.object({
    name: z.string().min(1, "Role name is required"),
    description: z.string().optional(),
    accessLevel: z.number().min(0).max(2), // 0: user, 1: admin, 2: owner
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission, getUserPermissions } =
        await import("~/lib/permissions.server");

    const { appUser } = await requirePermission(request, "roles", "retrieve");

    // Get all roles for the account (not just manageable ones)
    const allRoles = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.accountId, appUser.accountId));

    const { isNotDeleted } = await import("~/lib/db/soft-delete.server");
    const roleUsersList = await db
        .select({
            roleId: roleUsers.roleId,
            userId: roleUsers.userId,
            userEmail: users.email,
        })
        .from(roleUsers)
        .innerJoin(users, eq(roleUsers.userId, users.id))
        .where(
            and(eq(users.accountId, appUser.accountId), isNotDeleted(users))
        );

    const accountPermissions = await db
        .select()
        .from(permissions)
        .where(eq(permissions.accountId, appUser.accountId));

    const rolePermissionsList = await db
        .select({
            roleId: permissionRoles.roleId,
            permissionId: permissionRoles.permissionId,
        })
        .from(permissionRoles)
        .leftJoin(rolesTable, eq(permissionRoles.roleId, rolesTable.id))
        .where(eq(rolesTable.accountId, appUser.accountId));

    // Get current user's role assignments
    const userRoleAssignments = await db
        .select({
            roleId: roleUsers.roleId,
            roleName: rolesTable.name,
            roleDescription: rolesTable.description,
            accessLevel: rolesTable.accessLevel,
        })
        .from(roleUsers)
        .innerJoin(rolesTable, eq(roleUsers.roleId, rolesTable.id))
        .where(
            and(
                eq(roleUsers.userId, appUser.id),
                eq(rolesTable.accountId, appUser.accountId),
                isNotDeleted(roleUsers),
                isNotDeleted(rolesTable)
            )
        );

    // Get current user's permissions
    const userPermissions = await getUserPermissions(appUser.id);

    return {
        roles: allRoles,
        roleUsers: roleUsersList,
        permissions: accountPermissions,
        rolePermissions: rolePermissionsList,
        currentUser: appUser,
        userRoleAssignments,
        userPermissions,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { isPostgresError } = await import("~/lib/auth/errors.server");
    const {
        requirePermission,
        getUserAccessLevel,
        isProtectedRole,
        canManageRole,
    } = await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(request, "roles", "update");
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "create") {
            const accessLevelStr = formData.get("accessLevel");
            const accessLevelNum =
                accessLevelStr !== null
                    ? parseInt(accessLevelStr as string, 10)
                    : NaN;

            // Validate parseInt result before Zod validation
            if (isNaN(accessLevelNum)) {
                return createActionErrorResponse(
                    "Invalid access level. Must be a number.",
                    400
                );
            }

            const result = roleSchema.safeParse({
                name: formData.get("name"),
                description: formData.get("description"),
                accessLevel: accessLevelNum,
            });

            if (!result.success) {
                const errorMessage =
                    result.error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ") || "Invalid role data";
                return createActionErrorResponse(errorMessage, 400);
            }

            const { name, description, accessLevel } = result.data;

            // Check if current user can create roles at this access level
            const currentUserLevel = await getUserAccessLevel(appUser.id);
            if (currentUserLevel <= accessLevel) {
                return createActionErrorResponse(
                    "Cannot create roles with equal or higher access level",
                    403
                );
            }

            // Check if role name already exists
            const existingRole = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.name, name),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
            });

            if (existingRole) {
                return createActionErrorResponse(
                    "Role name already exists",
                    409
                );
            }

            try {
                const [newRole] = await db
                    .insert(rolesTable)
                    .values({
                        name,
                        description: description || "",
                        accessLevel,
                        accountId: appUser.accountId,
                    })
                    .returning();

                // Log role creation to audit logs
                try {
                    const { auditUserAction } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "role.created",
                        "roles",
                        newRole.id,
                        {
                            name: newRole.name,
                            description: newRole.description,
                            accessLevel: newRole.accessLevel,
                        },
                        {
                            roleName: newRole.name,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to create audit log for role creation",
                        {
                            error: auditError,
                            roleId: newRole.id,
                        }
                    );
                }

                return { success: true, role: newRole };
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    return createActionErrorResponse(
                        "Role name already exists",
                        409
                    );
                }
                throw error;
            }
        }

        if (intent === "update") {
            const roleId = formData.get("roleId");
            if (!roleId) {
                return createActionErrorResponse("Role ID is required", 400);
            }

            // Check if role is protected
            if (await isProtectedRole(roleId as string)) {
                return createActionErrorResponse(
                    "Cannot modify protected roles",
                    403
                );
            }

            // Check if current user can manage this role
            if (!(await canManageRole(appUser.id, roleId as string))) {
                return createActionErrorResponse(
                    "Insufficient privileges to manage this role",
                    403
                );
            }

            const accessLevelStr = formData.get("accessLevel");
            const accessLevelNum =
                accessLevelStr !== null
                    ? parseInt(accessLevelStr as string, 10)
                    : NaN;

            // Validate parseInt result before Zod validation
            if (isNaN(accessLevelNum)) {
                return createActionErrorResponse(
                    "Invalid access level. Must be a number.",
                    400
                );
            }

            const result = roleSchema.safeParse({
                name: formData.get("name"),
                description: formData.get("description"),
                accessLevel: accessLevelNum,
            });

            if (!result.success) {
                const errorMessage =
                    result.error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ") || "Invalid role data";
                return createActionErrorResponse(errorMessage, 400);
            }

            const { name, description, accessLevel } = result.data;

            // Check if current user can modify roles at this access level
            const currentUserLevel = await getUserAccessLevel(appUser.id);
            if (currentUserLevel <= accessLevel) {
                return createActionErrorResponse(
                    "Cannot modify roles with equal or higher access level",
                    403
                );
            }

            // Check if role name already exists (excluding current role)
            const existingRoleWithSameName = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.name, name),
                    eq(rolesTable.accountId, appUser.accountId),
                    ne(rolesTable.id, roleId as string) // Exclude current role
                ),
            });

            if (existingRoleWithSameName) {
                return createActionErrorResponse(
                    "Role name already exists",
                    409
                );
            }

            // Get role before update for audit log
            const roleBeforeUpdate = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.id, roleId as string),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
            });

            // Include accountId in WHERE clause for defense-in-depth
            await db
                .update(rolesTable)
                .set({
                    name,
                    description: description || "",
                    accessLevel,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(rolesTable.id, roleId as string),
                        eq(rolesTable.accountId, appUser.accountId)
                    )
                );

            // Log role update to audit logs
            if (roleBeforeUpdate) {
                try {
                    const { auditUserAction, createDiff } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "role.updated",
                        "roles",
                        roleId as string,
                        createDiff(
                            {
                                name: roleBeforeUpdate.name,
                                description: roleBeforeUpdate.description || "",
                                accessLevel: roleBeforeUpdate.accessLevel,
                            },
                            {
                                name,
                                description: description || "",
                                accessLevel,
                            }
                        ),
                        {
                            roleName: name,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error("Failed to create audit log for role update", {
                        error: auditError,
                        roleId: roleId as string,
                    });
                }
            }

            // Notify users assigned to this role
            try {
                const { createNotification } =
                    await import("~/lib/notifications/server");
                const { isNotDeleted } =
                    await import("~/lib/db/soft-delete.server");
                const usersWithRole = await db
                    .select({ userId: roleUsers.userId })
                    .from(roleUsers)
                    .innerJoin(users, eq(roleUsers.userId, users.id))
                    .where(
                        and(
                            eq(roleUsers.roleId, roleId as string),
                            eq(users.accountId, appUser.accountId),
                            isNotDeleted(roleUsers),
                            isNotDeleted(users)
                        )
                    );

                await Promise.all(
                    usersWithRole.map((u) =>
                        createNotification({
                            accountId: appUser.accountId,
                            userId: u.userId,
                            type: "info",
                            title: "Role Updated",
                            message: `The role "${name}" has been updated. Your permissions may have changed.`,
                            actionUrl: "/dashboard/account/roles",
                            actionLabel: "View Roles",
                        })
                    )
                );
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to send role update notifications", {
                    error: notificationError,
                    roleId: roleId as string,
                });
            }

            return { success: true };
        }

        if (intent === "delete") {
            const roleId = formData.get("roleId");
            if (!roleId) {
                return createActionErrorResponse("Role ID is required", 400);
            }

            // Check if role is protected
            if (await isProtectedRole(roleId as string)) {
                return createActionErrorResponse(
                    "Cannot delete protected roles",
                    403
                );
            }

            // Check if current user can manage this role
            if (!(await canManageRole(appUser.id, roleId as string))) {
                return createActionErrorResponse(
                    "Insufficient privileges to manage this role",
                    403
                );
            }

            // Get role name before deletion for notifications
            const roleToDelete = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.id, roleId as string),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
                columns: { name: true },
            });

            // Check if role is assigned to any users (with accountId verification)
            const assignedUsers = await db
                .select({ userId: roleUsers.userId })
                .from(roleUsers)
                .innerJoin(users, eq(roleUsers.userId, users.id))
                .where(
                    and(
                        eq(roleUsers.roleId, roleId as string),
                        eq(users.accountId, appUser.accountId)
                    )
                );

            if (assignedUsers.length > 0) {
                return createActionErrorResponse(
                    "Cannot delete role that is assigned to users",
                    409
                );
            }

            // Include accountId in WHERE clause for defense-in-depth
            await db
                .delete(rolesTable)
                .where(
                    and(
                        eq(rolesTable.id, roleId as string),
                        eq(rolesTable.accountId, appUser.accountId)
                    )
                );

            // Notify admins about role deletion (role wasn't assigned to users, so no user notifications needed)
            try {
                const { notifyAccountOwners } =
                    await import("~/lib/notifications/helpers.server");
                await notifyAccountOwners(appUser.accountId, {
                    type: "info",
                    title: "Role Deleted",
                    message: `The role "${roleToDelete?.name || "Unknown"}" has been deleted.`,
                    actionUrl: "/dashboard/account/roles",
                });
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to send role deletion notification", {
                    error: notificationError,
                    roleId: roleId as string,
                });
            }

            return { success: true };
        }

        if (intent === "assign-permission") {
            const roleId = formData.get("roleId");
            const permissionId = formData.get("permissionId");

            if (!roleId || !permissionId) {
                return createActionErrorResponse(
                    "Role ID and Permission ID are required",
                    400
                );
            }

            // Check if role is protected
            if (await isProtectedRole(roleId as string)) {
                return createActionErrorResponse(
                    "Cannot modify permissions for protected roles",
                    403
                );
            }

            // Check if current user can manage this role
            if (!(await canManageRole(appUser.id, roleId as string))) {
                return createActionErrorResponse(
                    "Insufficient privileges to manage this role",
                    403
                );
            }

            // Verify both role and permission belong to the same account
            const role = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.id, roleId as string),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
                columns: { id: true, accountId: true },
            });

            if (!role) {
                return createActionErrorResponse(
                    "Role not found or access denied",
                    404
                );
            }

            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId as string),
                    eq(permissions.accountId, appUser.accountId)
                ),
                columns: { id: true, accountId: true, entity: true },
            });

            if (!permission) {
                return createActionErrorResponse(
                    "Permission not found or access denied",
                    404
                );
            }

            // Check if permission is already assigned
            const existingAssignment = await db
                .select()
                .from(permissionRoles)
                .where(
                    and(
                        eq(permissionRoles.roleId, roleId as string),
                        eq(permissionRoles.permissionId, permissionId as string)
                    )
                );

            if (existingAssignment.length > 0) {
                return createActionErrorResponse(
                    "Permission is already assigned to this role",
                    409
                );
            }

            // Get role name for audit log
            const roleForAudit = await db.query.roles.findFirst({
                where: eq(rolesTable.id, roleId as string),
                columns: { name: true },
            });

            try {
                await db.insert(permissionRoles).values({
                    roleId: roleId as string,
                    permissionId: permissionId as string,
                });

                // Log permission assignment to audit logs
                try {
                    const { auditUserAction } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "role.permission_assigned",
                        "roles",
                        roleId as string,
                        undefined,
                        {
                            permissionId: permissionId as string,
                            permissionEntity: permission.entity,
                            roleName: roleForAudit?.name || "Unknown",
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to create audit log for permission assignment",
                        {
                            error: auditError,
                            roleId: roleId as string,
                            permissionId: permissionId as string,
                        }
                    );
                }

                // Notify users assigned to this role
                try {
                    const { createNotification } =
                        await import("~/lib/notifications/server");
                    const { isNotDeleted } =
                        await import("~/lib/db/soft-delete.server");
                    const usersWithRole = await db
                        .select({ userId: roleUsers.userId })
                        .from(roleUsers)
                        .innerJoin(users, eq(roleUsers.userId, users.id))
                        .where(
                            and(
                                eq(roleUsers.roleId, roleId as string),
                                eq(users.accountId, appUser.accountId),
                                isNotDeleted(roleUsers),
                                isNotDeleted(users)
                            )
                        );

                    await Promise.all(
                        usersWithRole.map((u) =>
                            createNotification({
                                accountId: appUser.accountId,
                                userId: u.userId,
                                type: "info",
                                title: "Role Permissions Changed",
                                message: `Permissions for role "${roleForAudit?.name || "Unknown"}" have been updated.`,
                                actionUrl: "/dashboard/account/roles",
                                actionLabel: "View Roles",
                            })
                        )
                    );
                } catch (notificationError) {
                    // Log notification error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to send permission assignment notifications",
                        {
                            error: notificationError,
                            roleId: roleId as string,
                        }
                    );
                }

                return { success: true };
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    return createActionErrorResponse(
                        "Permission is already assigned to this role",
                        409
                    );
                }
                throw error;
            }
        }

        if (intent === "remove-permission") {
            const roleId = formData.get("roleId");
            const permissionId = formData.get("permissionId");

            if (!roleId || !permissionId) {
                return createActionErrorResponse(
                    "Role ID and Permission ID are required",
                    400
                );
            }

            // Check if role is protected
            if (await isProtectedRole(roleId as string)) {
                return createActionErrorResponse(
                    "Cannot modify permissions for protected roles",
                    403
                );
            }

            // Check if current user can manage this role
            if (!(await canManageRole(appUser.id, roleId as string))) {
                return createActionErrorResponse(
                    "Insufficient privileges to manage this role",
                    403
                );
            }

            // Verify both role and permission belong to the same account
            const role = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.id, roleId as string),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
                columns: { id: true, accountId: true },
            });

            if (!role) {
                return createActionErrorResponse(
                    "Role not found or access denied",
                    404
                );
            }

            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId as string),
                    eq(permissions.accountId, appUser.accountId)
                ),
                columns: { id: true, accountId: true, entity: true },
            });

            if (!permission) {
                return createActionErrorResponse(
                    "Permission not found or access denied",
                    404
                );
            }

            // Get role name for audit log
            const roleForAudit = await db.query.roles.findFirst({
                where: eq(rolesTable.id, roleId as string),
                columns: { name: true },
            });

            // Where clause should be sufficient if our pre-deletion checks above pass (since we already verified that role and permission belong to the same acc)
            await db
                .delete(permissionRoles)
                .where(
                    and(
                        eq(permissionRoles.roleId, roleId as string),
                        eq(permissionRoles.permissionId, permissionId as string)
                    )
                );

            // Log permission removal to audit logs
            try {
                const { auditUserAction } = await import("~/lib/audit/server");
                await auditUserAction(
                    appUser,
                    "role.permission_removed",
                    "roles",
                    roleId as string,
                    undefined,
                    {
                        permissionId: permissionId as string,
                        permissionEntity: permission.entity,
                        roleName: roleForAudit?.name || "Unknown",
                    }
                );
            } catch (auditError) {
                // Log audit error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error(
                    "Failed to create audit log for permission removal",
                    {
                        error: auditError,
                        roleId: roleId as string,
                        permissionId: permissionId as string,
                    }
                );
            }

            // Notify users assigned to this role
            try {
                const { createNotification } =
                    await import("~/lib/notifications/server");
                const { isNotDeleted } =
                    await import("~/lib/db/soft-delete.server");
                const usersWithRole = await db
                    .select({ userId: roleUsers.userId })
                    .from(roleUsers)
                    .innerJoin(users, eq(roleUsers.userId, users.id))
                    .where(
                        and(
                            eq(roleUsers.roleId, roleId as string),
                            eq(users.accountId, appUser.accountId),
                            isNotDeleted(roleUsers),
                            isNotDeleted(users)
                        )
                    );

                await Promise.all(
                    usersWithRole.map((u) =>
                        createNotification({
                            accountId: appUser.accountId,
                            userId: u.userId,
                            type: "info",
                            title: "Role Permissions Changed",
                            message: `Permissions for role "${roleForAudit?.name || "Unknown"}" have been updated.`,
                            actionUrl: "/dashboard/account/roles",
                            actionLabel: "View Roles",
                        })
                    )
                );
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error(
                    "Failed to send permission removal notifications",
                    {
                        error: notificationError,
                        roleId: roleId as string,
                    }
                );
            }

            return { success: true };
        }

        return createActionErrorResponse("Invalid action", 400);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An error occurred";
        return createActionErrorResponse(message, 500);
    }
}

type Role = typeof rolesTable.$inferSelect;
type Permission = typeof permissions.$inferSelect;

export default function RolesManagement() {
    const {
        roles,
        roleUsers,
        permissions,
        rolePermissions: rolePermissionsList,
        currentUser,
        userRoleAssignments,
        userPermissions,
    } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [accessLevelFilter, setAccessLevelFilter] = useState<string>("all");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Create maps for easy lookup
    const rolePermissions = useMemo(() => {
        const map = new Map<string, Permission[]>();
        rolePermissionsList.forEach((rp) => {
            if (!map.has(rp.roleId)) {
                map.set(rp.roleId, []);
            }
            const permission = permissions.find(
                (p) => p.id === rp.permissionId
            );
            if (permission) {
                const rolePerms = map.get(rp.roleId);
                if (rolePerms) {
                    rolePerms.push(permission);
                }
            }
        });
        return map;
    }, [rolePermissionsList, permissions]);

    const roleUserCount = useMemo(() => {
        const map = new Map<string, number>();
        roleUsers.forEach((ru) => {
            const curr = map.get(ru.roleId) ?? 0;
            map.set(ru.roleId, curr + 1);
        });
        return map;
    }, [roleUsers]);

    // Filter and sort roles
    const filteredAndSortedRoles = useMemo(() => {
        let filtered = roles;

        // Filter by access level
        if (accessLevelFilter !== "all") {
            const level = parseInt(accessLevelFilter, 10);
            filtered = filtered.filter((role) => role.accessLevel === level);
        }

        // Sort by access level
        const sorted = [...filtered].sort((a, b) => {
            if (sortOrder === "asc") {
                return a.accessLevel - b.accessLevel;
            } else {
                return b.accessLevel - a.accessLevel;
            }
        });

        return sorted;
    }, [roles, accessLevelFilter, sortOrder]);

    const getAccessLevelIcon = (accessLevel: number) => {
        switch (accessLevel) {
            case 2:
                return <Crown className="h-4 w-4 text-yellow-600" />;
            case 1:
                return <Shield className="h-4 w-4 text-blue-600" />;
            default:
                return <User className="h-4 w-4 text-gray-600" />;
        }
    };

    const getAccessLevelBadge = (accessLevel: number) => {
        switch (accessLevel) {
            case 2:
                return (
                    <Badge
                        variant="secondary"
                        className="bg-yellow-100 text-yellow-800"
                    >
                        Owner
                    </Badge>
                );
            case 1:
                return (
                    <Badge
                        variant="secondary"
                        className="bg-accent-foreground text-accent"
                    >
                        Admin
                    </Badge>
                );
            default:
                return (
                    <Badge
                        variant="secondary"
                        className="bg-gray-100 text-gray-800"
                    >
                        User
                    </Badge>
                );
        }
    };

    // Helper function to check if current user can manage a role
    const canManageRole = (roleAccessLevel: number) => {
        // Map role strings to access levels
        const roleLevels = { user: 0, admin: 1, owner: 2 };
        const currentUserLevel = roleLevels[currentUser.role] || 0;
        return currentUserLevel > roleAccessLevel;
    };

    // Group permissions by entity
    const permissionsByEntity = useMemo(() => {
        const grouped = new Map<string, Set<string>>();
        userPermissions.forEach((perm) => {
            if (!perm.entity) return;
            if (!grouped.has(perm.entity)) {
                grouped.set(perm.entity, new Set());
            }
            perm.actions?.forEach((action) => {
                if (action) {
                    grouped.get(perm.entity!)?.add(action);
                }
            });
        });
        return grouped;
    }, [userPermissions]);

    // Format entity name for display
    const formatEntityName = (entity: string) => {
        return entity
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0 overflow-x-hidden">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-2xl font-medium">Role Management</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage roles and their permissions within your account
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Create Role
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Role</DialogTitle>
                        </DialogHeader>
                        <Form method="post" className="space-y-4">
                            <input type="hidden" name="intent" value="create" />

                            <div className="space-y-2">
                                <Label htmlFor="name">Role Name</Label>
                                <Input name="name" required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input name="description" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="accessLevel">
                                    Access Level
                                </Label>
                                <Select name="accessLevel" defaultValue="0">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">
                                            User (0)
                                        </SelectItem>
                                        <SelectItem value="1">
                                            Admin (1)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={navigation.state === "submitting"}
                                >
                                    {navigation.state === "submitting"
                                        ? "Creating..."
                                        : "Create Role"}
                                </Button>
                            </DialogFooter>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Current User's Roles and Permissions Section */}
            <Card>
                <CardHeader>
                    <CardTitle>My Roles & Permissions</CardTitle>
                    <CardDescription>
                        Your current role assignments and what you can do
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Base Role */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold">
                                Base Role:
                            </h4>
                            {getAccessLevelBadge(
                                currentUser.role === "owner"
                                    ? 2
                                    : currentUser.role === "admin"
                                      ? 1
                                      : 0
                            )}
                            <Badge variant="outline" className="ml-2">
                                {currentUser.role.charAt(0).toUpperCase() +
                                    currentUser.role.slice(1)}
                            </Badge>
                        </div>
                    </div>

                    {/* Custom Role Assignments */}
                    {userRoleAssignments.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold">
                                Custom Roles:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {userRoleAssignments.map((assignment) => (
                                    <div
                                        key={assignment.roleId}
                                        className="flex items-center gap-2"
                                    >
                                        <Badge variant="outline">
                                            {assignment.roleName}
                                        </Badge>
                                        {getAccessLevelBadge(
                                            assignment.accessLevel
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Permissions */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold">
                            Your Permissions:
                        </h4>
                        {permissionsByEntity.size > 0 ? (
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[200px]">
                                                Entity
                                            </TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Array.from(
                                            permissionsByEntity.entries()
                                        )
                                            .sort(([a], [b]) =>
                                                a.localeCompare(b)
                                            )
                                            .map(([entity, actions]) => (
                                                <TableRow key={entity}>
                                                    <TableCell className="font-medium">
                                                        {formatEntityName(
                                                            entity
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-2">
                                                            {Array.from(actions)
                                                                .sort()
                                                                .map(
                                                                    (
                                                                        action
                                                                    ) => (
                                                                        <Badge
                                                                            key={
                                                                                action
                                                                            }
                                                                            variant="secondary"
                                                                            className="text-xs"
                                                                        >
                                                                            {action
                                                                                .charAt(
                                                                                    0
                                                                                )
                                                                                .toUpperCase() +
                                                                                action.slice(
                                                                                    1
                                                                                )}
                                                                        </Badge>
                                                                    )
                                                                )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No custom permissions assigned. You have access
                                based on your base role only.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-6">
                    {/* Role Hierarchy Section */}
                    <div className="space-y-4">
                        <div className="bg-accent/50 text-accent-foreground rounded-lg p-6">
                            <h4 className="text-md font-semibold mb-4">
                                Role Hierarchy
                            </h4>
                            <p className="text-sm text-muted-foreground">
                                You can only manage roles with access levels
                                below yours. Owner-level roles (access level 2)
                                are protected and cannot be modified. All roles
                                in your account are shown below.
                            </p>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                            <div className="flex items-center gap-2">
                                <Label
                                    htmlFor="accessLevelFilter"
                                    className="text-sm font-medium"
                                >
                                    Filter by Access Level:
                                </Label>
                                <Select
                                    value={accessLevelFilter}
                                    onValueChange={setAccessLevelFilter}
                                >
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All Levels
                                        </SelectItem>
                                        <SelectItem value="0">
                                            User (0)
                                        </SelectItem>
                                        <SelectItem value="1">
                                            Admin (1)
                                        </SelectItem>
                                        <SelectItem value="2">
                                            Owner (2)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2">
                                <Label
                                    htmlFor="sortOrder"
                                    className="text-sm font-medium"
                                >
                                    Sort:
                                </Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setSortOrder(
                                            sortOrder === "asc" ? "desc" : "asc"
                                        )
                                    }
                                    className="w-[140px]"
                                >
                                    {sortOrder === "asc" ? (
                                        <>
                                            <ArrowUp className="h-4 w-4 mr-2" />
                                            Low to High
                                        </>
                                    ) : (
                                        <>
                                            <ArrowDown className="h-4 w-4 mr-2" />
                                            High to Low
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {accessLevelFilter !== "all" && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAccessLevelFilter("all")}
                                className="text-muted-foreground"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Clear Filters
                            </Button>
                        )}
                    </div>

                    <Table className="border rounded-lg">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[200px]">
                                    Role
                                </TableHead>
                                <TableHead className="min-w-[120px]">
                                    Access Level
                                </TableHead>
                                <TableHead className="min-w-[80px]">
                                    Users
                                </TableHead>
                                <TableHead className="min-w-[200px]">
                                    Permissions
                                </TableHead>
                                <TableHead className="min-w-[180px]">
                                    Actions
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedRoles.map((role) => {
                                const userCount =
                                    roleUserCount.get(role.id) || 0;
                                const rolePerms =
                                    rolePermissions.get(role.id) || [];

                                return (
                                    <TableRow key={role.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div>
                                                    {getAccessLevelIcon(
                                                        role.accessLevel
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-medium">
                                                        {role.name}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {role.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {getAccessLevelBadge(
                                                role.accessLevel
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm">
                                                {userCount} users
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {rolePerms.length > 0 ? (
                                                    rolePerms
                                                        .slice(0, 3)
                                                        .map((perm) => (
                                                            <Badge
                                                                key={perm.id}
                                                                variant="outline"
                                                                className="text-xs"
                                                            >
                                                                {perm.entity}
                                                            </Badge>
                                                        ))
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">
                                                        No permissions
                                                    </span>
                                                )}
                                                {rolePerms.length > 3 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        +{rolePerms.length - 3}{" "}
                                                        more
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <Link
                                                    to={`/dashboard/account/roles/${role.id}/manage`}
                                                    className={cn(
                                                        "w-full sm:w-auto disabled:pointer-events-none disabled:opacity-50",
                                                        !canManageRole(
                                                            role.accessLevel
                                                        ) &&
                                                            "pointer-events-none opacity-50"
                                                    )}
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={
                                                            !canManageRole(
                                                                role.accessLevel
                                                            )
                                                        }
                                                        title={
                                                            !canManageRole(
                                                                role.accessLevel
                                                            )
                                                                ? "You can only manage roles with access levels below yours"
                                                                : "Manage role permissions"
                                                        }
                                                    >
                                                        <Settings className="h-4 w-4 mr-2" />
                                                        Manage
                                                    </Button>
                                                </Link>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {filteredAndSortedRoles.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        {accessLevelFilter !== "all"
                            ? "No roles found matching the selected filter."
                            : "No roles found in your account. Create your first role to get started."}
                    </p>
                </div>
            )}
        </div>
    );
}
