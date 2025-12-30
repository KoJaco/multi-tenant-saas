import {
    Form,
    Link,
    redirect,
    useLoaderData,
    useActionData,
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

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Badge } from "~/components/ui/badge";
import { ArrowLeft, Shield, Crown, User, Trash2, X } from "lucide-react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { useState, useMemo } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { Checkbox } from "~/components/ui/checkbox";
import { Select, SelectContent, SelectTrigger } from "~/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/ui/dialog";

const roleSchema = z.object({
    name: z.string().min(1, "Role name is required"),
    description: z.string().optional(),
    accessLevel: z.number().min(0).max(2),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission, canManageRole } =
        await import("~/lib/permissions.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { getCsrfToken } = await import("~/lib/csrf.server");

    const { appUser } = await requirePermission(request, "roles", "retrieve");
    const roleId = params.roleId;
    const csrfToken = await getCsrfToken(request);

    if (!roleId) {
        throw redirect("/dashboard/account/roles");
    }

    // Get the role
    const role = await db.query.roles.findFirst({
        where: and(
            eq(rolesTable.id, roleId),
            eq(rolesTable.accountId, appUser.accountId)
        ),
    });

    if (!role) {
        throw createActionErrorResponse("Role not found", 404);
    }

    // Check if current user can manage this role
    const canManage = await canManageRole(appUser.id, roleId);
    if (!canManage) {
        throw createActionErrorResponse(
            "Insufficient privileges to manage this role",
            403
        );
    }

    // Get users assigned to this role
    const roleUsersList = await db
        .select({
            userId: roleUsers.userId,
            userEmail: users.email,
            userRole: users.role,
        })
        .from(roleUsers)
        .innerJoin(users, eq(roleUsers.userId, users.id))
        .where(
            and(
                eq(roleUsers.roleId, roleId),
                eq(users.accountId, appUser.accountId)
            )
        );

    // Get all permissions for the account
    const accountPermissions = await db
        .select()
        .from(permissions)
        .where(eq(permissions.accountId, appUser.accountId));

    // Get permissions assigned to this role
    const rolePermissionsList = await db
        .select({
            permissionId: permissionRoles.permissionId,
        })
        .from(permissionRoles)
        .where(eq(permissionRoles.roleId, roleId));

    const assignedPermissionIds = new Set(
        rolePermissionsList.map((rp) => rp.permissionId)
    );
    const assignedPermissions = accountPermissions.filter((p) =>
        assignedPermissionIds.has(p.id)
    );
    const availablePermissions = accountPermissions.filter(
        (p) => !assignedPermissionIds.has(p.id)
    );

    // Group available permissions by entity
    const permissionsByEntity = new Map<string, typeof availablePermissions>();
    for (const permission of availablePermissions) {
        const entity = permission.entity as string;
        if (!entity) continue;
        if (!permissionsByEntity.has(entity)) {
            permissionsByEntity.set(entity, []);
        }
        permissionsByEntity.get(entity)!.push(permission);
    }

    // Get all roles at the same access level to check if this is the only one
    const rolesAtSameLevel = await db
        .select()
        .from(rolesTable)
        .where(
            and(
                eq(rolesTable.accountId, appUser.accountId),
                eq(rolesTable.accessLevel, role.accessLevel),
                ne(rolesTable.id, roleId)
            )
        );

    const isOnlyRoleAtLevel = rolesAtSameLevel.length === 0;

    return {
        role,
        roleUsers: roleUsersList,
        assignedPermissions,
        availablePermissions,
        permissionsByEntity: Object.fromEntries(permissionsByEntity),
        entityNames: Array.from(permissionsByEntity.keys()).sort(),
        isOnlyRoleAtLevel,
        currentUser: appUser,
        csrfToken,
    };
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { isPostgresError } = await import("~/lib/auth/errors.server");
    const {
        requirePermission,
        getUserAccessLevel,
        isProtectedRole,
        canManageRole,
    } = await import("~/lib/permissions.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createActionErrorResponse("Invalid CSRF token", 403);
        }
        throw error;
    }

    const { appUser } = await requirePermission(request, "roles", "update");
    const roleId = params.roleId as string;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (!roleId) {
        return createActionErrorResponse("Role ID is required", 400);
    }

    // Verify role exists and belongs to the account
    const role = await db.query.roles.findFirst({
        where: and(
            eq(rolesTable.id, roleId),
            eq(rolesTable.accountId, appUser.accountId)
        ),
        columns: { id: true, accountId: true },
    });

    if (!role) {
        return createActionErrorResponse("Role not found", 404);
    }

    // Check if role is protected
    if (await isProtectedRole(roleId)) {
        return createActionErrorResponse("Cannot modify protected roles", 403);
    }

    // Check if current user can manage this role
    if (!(await canManageRole(appUser.id, roleId))) {
        return createActionErrorResponse(
            "Insufficient privileges to manage this role",
            403
        );
    }

    try {
        if (intent === "update") {
            const accessLevelStr = formData.get("accessLevel");
            const accessLevelNum =
                accessLevelStr !== null
                    ? parseInt(accessLevelStr as string, 10)
                    : NaN;

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
                    ne(rolesTable.id, roleId)
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
                    eq(rolesTable.id, roleId),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
            });

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
                        eq(rolesTable.id, roleId),
                        eq(rolesTable.accountId, appUser.accountId)
                    )
                );

            // Log role update to audit logs
            if (roleBeforeUpdate) {
                try {
                    const { auditUserAction, createDiff } = await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "role.updated",
                        "roles",
                        roleId,
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
                        roleId: roleId,
                    });
                }
            }

            return { success: true, message: "Role updated successfully" };
        }

        if (intent === "assign-permission") {
            const permissionId = formData.get("permissionId") as string;

            if (!permissionId) {
                return createActionErrorResponse(
                    "Permission ID is required",
                    400
                );
            }

            // Verify permission belongs to the same account
            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId),
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
                        eq(permissionRoles.roleId, roleId),
                        eq(permissionRoles.permissionId, permissionId)
                    )
                );

            if (existingAssignment.length > 0) {
                return createActionErrorResponse(
                    "Permission is already assigned to this role",
                    409
                );
            }

            try {
                await db.insert(permissionRoles).values({
                    roleId: roleId,
                    permissionId: permissionId,
                });

                // Log permission assignment to audit logs
                try {
                    const { auditUserAction } = await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "role.permission_assigned",
                        "roles",
                        roleId,
                        undefined,
                        {
                            permissionId: permissionId,
                            permissionEntity: permission.entity,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error("Failed to create audit log for permission assignment", {
                        error: auditError,
                        roleId: roleId,
                        permissionId: permissionId,
                    });
                }

                return {
                    success: true,
                    message: "Permission assigned successfully",
                };
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
            const permissionId = formData.get("permissionId") as string;

            if (!permissionId) {
                return createActionErrorResponse(
                    "Permission ID is required",
                    400
                );
            }

            // Verify permission belongs to the same account
            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId),
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

            await db
                .delete(permissionRoles)
                .where(
                    and(
                        eq(permissionRoles.roleId, roleId),
                        eq(permissionRoles.permissionId, permissionId)
                    )
                );

            // Log permission removal to audit logs
            try {
                const { auditUserAction } = await import("~/lib/audit/server");
                await auditUserAction(
                    appUser,
                    "role.permission_removed",
                    "roles",
                    roleId,
                    undefined,
                    {
                        permissionId: permissionId,
                        permissionEntity: permission.entity,
                    }
                );
            } catch (auditError) {
                // Log audit error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to create audit log for permission removal", {
                    error: auditError,
                    roleId: roleId,
                    permissionId: permissionId,
                });
            }

            return {
                success: true,
                message: "Permission removed successfully",
            };
        }

        if (intent === "delete") {
            // Get full role details for audit log
            const fullRole = await db.query.roles.findFirst({
                where: and(
                    eq(rolesTable.id, roleId),
                    eq(rolesTable.accountId, appUser.accountId)
                ),
            });

            if (!fullRole) {
                return createActionErrorResponse("Role not found", 404);
            }

            // Check if role is assigned to any users
            const assignedUsers = await db
                .select()
                .from(roleUsers)
                .innerJoin(users, eq(roleUsers.userId, users.id))
                .where(
                    and(
                        eq(roleUsers.roleId, roleId),
                        eq(users.accountId, appUser.accountId)
                    )
                );

            if (assignedUsers.length > 0) {
                return createActionErrorResponse(
                    "Cannot delete role that is assigned to users",
                    409
                );
            }

            // Check if this is the only role at its access level
            const rolesAtSameLevel = await db
                .select()
                .from(rolesTable)
                .where(
                    and(
                        eq(rolesTable.accountId, appUser.accountId),
                        eq(rolesTable.accessLevel, fullRole.accessLevel),
                        ne(rolesTable.id, roleId)
                    )
                );

            if (rolesAtSameLevel.length === 0) {
                return createActionErrorResponse(
                    "Cannot delete the only role at this access level",
                    409
                );
            }

            // Delete the role
            await db
                .delete(rolesTable)
                .where(
                    and(
                        eq(rolesTable.id, roleId),
                        eq(rolesTable.accountId, appUser.accountId)
                    )
                );

            // Log to audit_logs
            const { auditUserAction } = await import("~/lib/audit/server");
            await auditUserAction(
                appUser,
                "role.deleted",
                "roles",
                roleId,
                {
                    before: {
                        id: fullRole.id,
                        name: fullRole.name,
                        description: fullRole.description,
                        accessLevel: fullRole.accessLevel,
                    },
                    after: null,
                },
                {
                    deletedBy: appUser.email,
                    accessLevel: fullRole.accessLevel,
                }
            );

            // Redirect to roles list after successful deletion
            throw redirect("/dashboard/account/roles");
        }

        return createActionErrorResponse("Invalid action", 400);
    } catch (error) {
        if (error instanceof Response) {
            throw error; // Re-throw redirects
        }
        const message =
            error instanceof Error ? error.message : "An error occurred";
        return createActionErrorResponse(message, 500);
    }
}

function getAccessLevelIcon(accessLevel: number) {
    switch (accessLevel) {
        case 2:
            return <Crown className="h-5 w-5 text-yellow-600" />;
        case 1:
            return <Shield className="h-5 w-5 text-blue-600" />;
        default:
            return <User className="h-5 w-5 text-gray-600" />;
    }
}

function getAccessLevelBadge(accessLevel: number) {
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
                    className="bg-blue-100 text-blue-800"
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
}

export default function ManageRole() {
    const {
        role,
        roleUsers,
        assignedPermissions,
        availablePermissions,
        permissionsByEntity,
        entityNames,
        isOnlyRoleAtLevel,
        currentUser,
        csrfToken,
    } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [selectedEntities, setSelectedEntities] = useState<string[]>(
        entityNames.length > 0 ? [...entityNames] : []
    );
    const [isSelectOpen, setIsSelectOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [reason, setReason] = useState("");

    const isSubmitting = navigation.state === "submitting";
    const canModify =
        currentUser.role === "owner" || currentUser.role === "admin";

    const canDelete = roleUsers.length === 0 && !isOnlyRoleAtLevel;
    const requiredText = "Delete Role";
    const canSubmitDelete =
        confirmationText === requiredText && reason.trim().length >= 10;

    const selectedEntityPermissions = useMemo(() => {
        if (selectedEntities.length === 0) {
            return [];
        }
        return selectedEntities.flatMap((entity) => {
            return permissionsByEntity[entity] || [];
        });
    }, [selectedEntities, permissionsByEntity]);

    const handleEntityToggle = (entity: string) => {
        setSelectedEntities((prev) => {
            if (prev.includes(entity)) {
                return prev.filter((e) => e !== entity);
            } else {
                return [...prev, entity];
            }
        });
    };

    const handleRemoveEntity = (entity: string) => {
        setSelectedEntities((prev) => prev.filter((e) => e !== entity));
    };

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0 overflow-x-hidden">
            {/* Header */}
            <div className="flex items-start gap-4 flex-col">
                <Link to="/dashboard/account/roles">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Roles
                    </Button>
                </Link>
                <div>
                    <h3 className="text-2xl font-medium">Manage Role</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage role details and permissions
                    </p>
                </div>
            </div>

            {/* Success/Error Messages */}
            {actionData?.message && (
                <div
                    className={`rounded-md p-3 ${
                        actionData.success
                            ? "bg-emerald-500/10 border border-emerald-500/20"
                            : "bg-red-500/10 border border-red-500/20"
                    }`}
                >
                    <p
                        className={`text-sm ${
                            actionData.success
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300"
                        }`}
                    >
                        {actionData.message}
                    </p>
                </div>
            )}

            {actionData && !actionData.success && actionData.message && (
                <ErrorAlert title="Error" message={actionData.message} />
            )}

            <Card>
                <CardContent className="space-y-6">
                    {/* Role Information Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                {getAccessLevelIcon(role.accessLevel)}
                                Role Information
                            </h4>
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {role.name}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {role.description ||
                                                "No description"}
                                        </div>
                                    </div>
                                    {getAccessLevelBadge(role.accessLevel)}
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">
                                            Access Level:
                                        </span>
                                        <span className="font-medium">
                                            {role.accessLevel}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">
                                            Assigned Users:
                                        </span>
                                        <span className="font-medium">
                                            {roleUsers.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">
                                            Permissions:
                                        </span>
                                        <span className="font-medium">
                                            {assignedPermissions.length}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Assigned Users Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Assigned Users
                            </h4>
                            {roleUsers.length > 0 ? (
                                <div className="space-y-2">
                                    {roleUsers.map((ru) => (
                                        <div
                                            key={ru.userId}
                                            className="flex items-center justify-between"
                                        >
                                            <span className="text-sm font-medium">
                                                {ru.userEmail}
                                            </span>
                                            {/* TODO: Add manage link if permission */}
                                            {/* <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                {ru.userRole}
                                            </Badge> */}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No users assigned to this role
                                </p>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Current Permissions Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Current Permissions
                            </h4>
                            {assignedPermissions.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Entity</TableHead>
                                                <TableHead>
                                                    Description
                                                </TableHead>
                                                <TableHead>Actions</TableHead>
                                                <TableHead className="text-right">
                                                    Actions
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {assignedPermissions.map(
                                                (permission) => (
                                                    <TableRow
                                                        key={permission.id}
                                                    >
                                                        <TableCell>
                                                            <div className="font-medium">
                                                                {
                                                                    permission.entity
                                                                }
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-sm text-muted-foreground">
                                                                {permission.description ||
                                                                    "No description"}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {permission.actions?.map(
                                                                    (
                                                                        action: string
                                                                    ) => (
                                                                        <Badge
                                                                            key={
                                                                                action
                                                                            }
                                                                            variant="outline"
                                                                            className="text-xs"
                                                                        >
                                                                            {
                                                                                action
                                                                            }
                                                                        </Badge>
                                                                    )
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Form method="post">
                                                                <input
                                                                    type="hidden"
                                                                    name="csrf_token"
                                                                    value={
                                                                        csrfToken
                                                                    }
                                                                />
                                                                <input
                                                                    type="hidden"
                                                                    name="intent"
                                                                    value="remove-permission"
                                                                />
                                                                <input
                                                                    type="hidden"
                                                                    name="roleId"
                                                                    value={
                                                                        role.id
                                                                    }
                                                                />
                                                                <input
                                                                    type="hidden"
                                                                    name="permissionId"
                                                                    value={
                                                                        permission.id
                                                                    }
                                                                />
                                                                <Button
                                                                    type="submit"
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    disabled={
                                                                        isSubmitting
                                                                    }
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </Form>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                    No permissions assigned
                                </div>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Available Permissions Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Available Permissions
                            </h4>
                            {availablePermissions.length > 0 ? (
                                <div className="space-y-4 w-full">
                                    {/* Entity Multi-Select */}
                                    <div className="flex flex-col items-start gap-2">
                                        <Select
                                            open={isSelectOpen}
                                            onOpenChange={setIsSelectOpen}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <span className="text-sm">
                                                    {selectedEntities.length ===
                                                    0
                                                        ? "Select Entities"
                                                        : selectedEntities.length ===
                                                            1
                                                          ? selectedEntities[0]
                                                          : `${selectedEntities.length} selected`}
                                                </span>
                                            </SelectTrigger>
                                            <SelectContent
                                                className="w-64"
                                                onPointerDownOutside={(e) => {
                                                    // Prevent closing when clicking checkboxes
                                                    const target =
                                                        e.target as HTMLElement;
                                                    if (
                                                        target.closest(
                                                            '[role="checkbox"]'
                                                        ) ||
                                                        target.closest("label")
                                                    ) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                <div className="space-y-2 p-2">
                                                    <Label className="text-sm font-medium">
                                                        Filter by Entity
                                                    </Label>
                                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                                        {entityNames.map(
                                                            (entity) => (
                                                                <div
                                                                    key={entity}
                                                                    className="flex items-center space-x-2"
                                                                >
                                                                    <Checkbox
                                                                        id={`entity-${entity}`}
                                                                        checked={selectedEntities.includes(
                                                                            entity
                                                                        )}
                                                                        onCheckedChange={() =>
                                                                            handleEntityToggle(
                                                                                entity
                                                                            )
                                                                        }
                                                                    />
                                                                    <Label
                                                                        htmlFor={`entity-${entity}`}
                                                                        className="text-sm font-normal cursor-pointer flex-1 flex items-center justify-between"
                                                                    >
                                                                        <span>
                                                                            {
                                                                                entity
                                                                            }
                                                                        </span>
                                                                        <Badge
                                                                            variant="secondary"
                                                                            className="text-xs ml-2"
                                                                        >
                                                                            {permissionsByEntity[
                                                                                entity
                                                                            ]
                                                                                ?.length ||
                                                                                0}
                                                                        </Badge>
                                                                    </Label>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectContent>
                                        </Select>

                                        {/* Selected Entities Badges */}
                                        {selectedEntities.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {selectedEntities.map(
                                                    (entity) => (
                                                        <Badge
                                                            key={entity}
                                                            variant="secondary"
                                                            className="flex items-center gap-1"
                                                        >
                                                            {entity}
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleRemoveEntity(
                                                                        entity
                                                                    )
                                                                }
                                                                className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </Badge>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Permissions Table */}
                                    {selectedEntityPermissions.length > 0 ? (
                                        <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>
                                                            Entity
                                                        </TableHead>
                                                        <TableHead>
                                                            Description
                                                        </TableHead>
                                                        <TableHead>
                                                            Actions
                                                        </TableHead>
                                                        <TableHead className="text-right">
                                                            Actions
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedEntityPermissions.map(
                                                        (permission) => (
                                                            <TableRow
                                                                key={
                                                                    permission.id
                                                                }
                                                            >
                                                                <TableCell>
                                                                    <div className="font-medium">
                                                                        {
                                                                            permission.entity
                                                                        }
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="text-sm text-muted-foreground">
                                                                        {permission.description ||
                                                                            "No description"}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {permission.actions?.map(
                                                                            (
                                                                                action: string
                                                                            ) => (
                                                                                <Badge
                                                                                    key={
                                                                                        action
                                                                                    }
                                                                                    variant="outline"
                                                                                    className="text-xs"
                                                                                >
                                                                                    {
                                                                                        action
                                                                                    }
                                                                                </Badge>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Form method="post">
                                                                        <input
                                                                            type="hidden"
                                                                            name="csrf_token"
                                                                            value={
                                                                                csrfToken
                                                                            }
                                                                        />
                                                                        <input
                                                                            type="hidden"
                                                                            name="intent"
                                                                            value="assign-permission"
                                                                        />
                                                                        <input
                                                                            type="hidden"
                                                                            name="roleId"
                                                                            value={
                                                                                role.id
                                                                            }
                                                                        />
                                                                        <input
                                                                            type="hidden"
                                                                            name="permissionId"
                                                                            value={
                                                                                permission.id
                                                                            }
                                                                        />
                                                                        <Button
                                                                            type="submit"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            disabled={
                                                                                isSubmitting
                                                                            }
                                                                        >
                                                                            Assign
                                                                        </Button>
                                                                    </Form>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-muted-foreground">
                                            No permissions available for
                                            selected entities. Select entities
                                            above to view permissions.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                    All permissions are already assigned
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Danger Zone Section */}
                    <>
                        <Separator />
                        <div className="space-y-4">
                            <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-6">
                                <h4 className="text-md font-semibold text-destructive mb-4 flex items-center gap-2">
                                    <Trash2 className="h-5 w-5" />
                                    Danger Zone
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="font-medium mb-2">
                                            Delete Role
                                        </p>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Permanently delete this role from
                                            your account. This action cannot be
                                            undone.
                                        </p>

                                        {/* Deletion Criteria Info */}
                                        <div className="bg-muted p-3 rounded-md space-y-2 mb-4">
                                            <p className="text-sm font-medium">
                                                Deletion Requirements:
                                            </p>
                                            <ul className="text-sm space-y-1 list-disc list-inside">
                                                <li
                                                    className={
                                                        roleUsers.length === 0
                                                            ? "text-emerald-600"
                                                            : "text-destructive"
                                                    }
                                                >
                                                    No users assigned to this
                                                    role
                                                    {roleUsers.length > 0 && (
                                                        <span className="ml-2">
                                                            ({roleUsers.length}{" "}
                                                            users currently
                                                            assigned)
                                                        </span>
                                                    )}
                                                </li>
                                                <li
                                                    className={
                                                        !isOnlyRoleAtLevel
                                                            ? "text-emerald-600"
                                                            : "text-destructive"
                                                    }
                                                >
                                                    Not the only role at access
                                                    level {role.accessLevel}
                                                    {isOnlyRoleAtLevel && (
                                                        <span className="ml-2">
                                                            (This is the only
                                                            role at this level)
                                                        </span>
                                                    )}
                                                </li>
                                            </ul>
                                        </div>

                                        <Dialog
                                            open={isDeleteDialogOpen}
                                            onOpenChange={setIsDeleteDialogOpen}
                                        >
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="destructive"
                                                    disabled={!canDelete}
                                                    className="w-full sm:w-auto"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete Role
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>
                                                        Delete Role
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        This will permanently
                                                        delete the role "
                                                        {role.name}" from your
                                                        account. This action
                                                        cannot be undone.
                                                    </DialogDescription>
                                                </DialogHeader>

                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="confirmationText">
                                                            Type{" "}
                                                            <span className="font-mono font-semibold">
                                                                {requiredText}
                                                            </span>{" "}
                                                            to confirm:
                                                        </Label>
                                                        <Input
                                                            id="confirmationText"
                                                            name="confirmationText"
                                                            value={
                                                                confirmationText
                                                            }
                                                            onChange={(e) =>
                                                                setConfirmationText(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={
                                                                requiredText
                                                            }
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                        />
                                                        {confirmationText &&
                                                            confirmationText !==
                                                                requiredText && (
                                                                <p className="text-sm text-destructive">
                                                                    Confirmation
                                                                    text does
                                                                    not match
                                                                </p>
                                                            )}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label htmlFor="reason">
                                                            Reason for deletion{" "}
                                                            <span className="text-destructive">
                                                                *
                                                            </span>
                                                        </Label>
                                                        <Textarea
                                                            id="reason"
                                                            name="reason"
                                                            value={reason}
                                                            onChange={(e) =>
                                                                setReason(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="Explain why you are deleting this role..."
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                            rows={3}
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            Minimum 10
                                                            characters required.
                                                            This reason will be
                                                            logged in the audit
                                                            trail.
                                                        </p>
                                                        {reason.trim().length >
                                                            0 &&
                                                            reason.trim()
                                                                .length <
                                                                10 && (
                                                                <p className="text-sm text-destructive">
                                                                    Reason must
                                                                    be at least
                                                                    10
                                                                    characters
                                                                    long
                                                                </p>
                                                            )}
                                                    </div>
                                                </div>

                                                <DialogFooter>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => {
                                                            setIsDeleteDialogOpen(
                                                                false
                                                            );
                                                            setConfirmationText(
                                                                ""
                                                            );
                                                            setReason("");
                                                        }}
                                                        disabled={isSubmitting}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Form method="post">
                                                        <input
                                                            type="hidden"
                                                            name="csrf_token"
                                                            value={csrfToken}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="intent"
                                                            value="delete"
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="roleId"
                                                            value={role.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="reason"
                                                            value={reason}
                                                        />
                                                        <Button
                                                            type="submit"
                                                            variant="destructive"
                                                            disabled={
                                                                !canSubmitDelete ||
                                                                isSubmitting
                                                            }
                                                        >
                                                            {isSubmitting
                                                                ? "Deleting..."
                                                                : "Delete Role"}
                                                        </Button>
                                                    </Form>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                </CardContent>
            </Card>
        </div>
    );
}
