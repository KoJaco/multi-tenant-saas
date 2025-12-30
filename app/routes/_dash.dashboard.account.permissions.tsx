import {
    Form,
    useLoaderData,
    useNavigation,
    useActionData,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { permissions, permissionRoles, roles } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
import { useState, useMemo, useEffect } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { PlusIcon, Shield, Crown, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { ErrorAlert } from "~/components/ui/error-alert";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type {
    Entity as EntityType,
    Action as ActionType,
} from "~/lib/db/types";
import { entityEnum, actionEnum } from "~/lib/db/schema";

// this permissionSchema should use the Entity and Action types from above ^
// Keep DB schema as single source of truth
const entityZodEnum = z.enum(entityEnum.enumValues as [string, ...string[]]);
const actionZodEnum = z.enum(actionEnum.enumValues as [string, ...string[]]);

const permissionSchema = z.object({
    entity: entityZodEnum,
    actions: z.array(actionZodEnum).min(1, "At least one action is required"),
    description: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission } = await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(
        request,
        "permissions",
        "retrieve"
    );

    const accountPermissions = await db
        .select()
        .from(permissions)
        .where(eq(permissions.accountId, appUser.accountId));

    const permissionRolesList = await db
        .select({
            permissionId: permissionRoles.permissionId,
            roleId: permissionRoles.roleId,
            roleName: roles.name,
        })
        .from(permissionRoles)
        .innerJoin(roles, eq(permissionRoles.roleId, roles.id))
        .where(eq(roles.accountId, appUser.accountId));

    return {
        permissions: accountPermissions,
        permissionRoles: permissionRolesList,
        currentUser: appUser,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission } = await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(request, "permissions", [
        "create",
        "update",
        "delete",
    ]);
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { isPostgresError } = await import("~/lib/auth/errors.server");
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "create") {
            const result = permissionSchema.safeParse({
                entity: formData.get("entity"),
                actions: formData.getAll("actions"),
                description: formData.get("description"),
            });

            if (!result.success) {
                const errorMessage =
                    result.error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ") || "Invalid permission data";
                return createActionErrorResponse(errorMessage, 400);
            }

            const { entity, actions, description } = result.data;

            // Enforce audit_logs can only have "retrieve" action
            if (entity === "audit_logs") {
                const invalidActions = actions.filter(
                    (action) => action !== "retrieve"
                );
                if (invalidActions.length > 0) {
                    return createActionErrorResponse(
                        "Audit logs are immutable and can only have the 'retrieve' action",
                        400
                    );
                }
                // Ensure retrieve is included
                if (!actions.includes("retrieve")) {
                    return createActionErrorResponse(
                        "Audit logs permissions must include the 'retrieve' action",
                        400
                    );
                }
            }

            // Type assertions are safe here because Zod has validated the data
            // Allow multiple permissions for the same entity with different action sets
            // The database will handle any actual constraint violations
            try {
                const [newPermission] = await db
                    .insert(permissions)
                    .values({
                        entity: entity as EntityType,
                        actions: actions as ActionType[],
                        description: description || "",
                        accountId: appUser.accountId,
                        isCritical: false,
                        isOwnerOnly: false,
                    })
                    .returning();

                // Log permission creation to audit logs
                try {
                    const { auditUserAction } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "permission.created",
                        "permissions",
                        newPermission.id,
                        {
                            entity: newPermission.entity,
                            actions: newPermission.actions,
                            description: newPermission.description || "",
                        },
                        {
                            entity: newPermission.entity,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to create audit log for permission creation",
                        {
                            error: auditError,
                            permissionId: newPermission.id,
                        }
                    );
                }

                return { success: true, permission: newPermission };
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    return createActionErrorResponse(
                        "Permission for this entity already exists",
                        409
                    );
                }
                throw error;
            }
        }

        if (intent === "update") {
            const permissionId = formData.get("permissionId");
            if (!permissionId) {
                return createActionErrorResponse(
                    "Permission ID is required",
                    400
                );
            }

            // Check if permission exists and belongs to user's account
            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId as string),
                    eq(permissions.accountId, appUser.accountId)
                ),
            });

            if (!permission) {
                return createActionErrorResponse(
                    "Permission not found or access denied",
                    404
                );
            }

            if (permission.isCritical || permission.isOwnerOnly) {
                return createActionErrorResponse(
                    "Cannot modify critical or owner-only permissions",
                    403
                );
            }

            const result = permissionSchema.safeParse({
                entity: formData.get("entity"),
                actions: formData.getAll("actions"),
                description: formData.get("description"),
            });

            if (!result.success) {
                const errorMessage =
                    result.error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ") || "Invalid permission data";
                return createActionErrorResponse(errorMessage, 400);
            }

            const { entity, actions, description } = result.data;

            // Enforce audit_logs can only have "retrieve" action
            if (entity === "audit_logs") {
                const invalidActions = actions.filter(
                    (action) => action !== "retrieve"
                );
                if (invalidActions.length > 0) {
                    return createActionErrorResponse(
                        "Audit logs are immutable and can only have the 'retrieve' action",
                        400
                    );
                }
                // Ensure retrieve is included
                if (!actions.includes("retrieve")) {
                    return createActionErrorResponse(
                        "Audit logs permissions must include the 'retrieve' action",
                        400
                    );
                }
            }

            // Get permission before update for audit log (permission was already fetched above)
            const permissionBeforeUpdate = permission;

            // Type assertions are safe here because Zod has validated the data
            // Include accountId in WHERE clause for defense-in-depth
            await db
                .update(permissions)
                .set({
                    entity: entity as EntityType,
                    actions: actions as ActionType[],
                    description: description || "",
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(permissions.id, permissionId as string),
                        eq(permissions.accountId, appUser.accountId)
                    )
                );

            // Log permission update to audit logs
            if (permissionBeforeUpdate) {
                try {
                    const { auditUserAction, createDiff } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "permission.updated",
                        "permissions",
                        permissionId as string,
                        createDiff(
                            {
                                entity: permissionBeforeUpdate.entity,
                                actions: permissionBeforeUpdate.actions,
                                description:
                                    permissionBeforeUpdate.description || "",
                            },
                            {
                                entity: entity as EntityType,
                                actions: actions as ActionType[],
                                description: description || "",
                            }
                        ),
                        {
                            entity: entity as EntityType,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to create audit log for permission update",
                        {
                            error: auditError,
                            permissionId: permissionId as string,
                        }
                    );
                }
            }

            return { success: true };
        }

        if (intent === "delete") {
            const permissionId = formData.get("permissionId");
            if (!permissionId) {
                return createActionErrorResponse(
                    "Permission ID is required",
                    400
                );
            }

            // Check if permission exists and belongs to user's account
            const permission = await db.query.permissions.findFirst({
                where: and(
                    eq(permissions.id, permissionId as string),
                    eq(permissions.accountId, appUser.accountId)
                ),
            });

            if (!permission) {
                return createActionErrorResponse(
                    "Permission not found or access denied",
                    404
                );
            }

            if (permission.isCritical || permission.isOwnerOnly) {
                return createActionErrorResponse(
                    "Cannot delete critical or owner-only permissions",
                    403
                );
            }

            // Check if permission is assigned to any roles (with accountId verification)
            const assignedRoles = await db
                .select()
                .from(permissionRoles)
                .innerJoin(roles, eq(permissionRoles.roleId, roles.id))
                .where(
                    and(
                        eq(
                            permissionRoles.permissionId,
                            permissionId as string
                        ),
                        eq(roles.accountId, appUser.accountId)
                    )
                );

            if (assignedRoles.length > 0) {
                return createActionErrorResponse(
                    "Cannot delete permission that is assigned to roles",
                    409
                );
            }

            // Permission was already fetched above, use it for audit log
            const permissionBeforeDelete = permission;

            // Include accountId in WHERE clause for defense-in-depth
            await db
                .delete(permissions)
                .where(
                    and(
                        eq(permissions.id, permissionId as string),
                        eq(permissions.accountId, appUser.accountId)
                    )
                );

            // Log permission deletion to audit logs
            if (permissionBeforeDelete) {
                try {
                    const { auditUserAction } =
                        await import("~/lib/audit/server");
                    await auditUserAction(
                        appUser,
                        "permission.deleted",
                        "permissions",
                        permissionId as string,
                        {
                            before: {
                                entity: permissionBeforeDelete.entity,
                                actions: permissionBeforeDelete.actions,
                                description:
                                    permissionBeforeDelete.description || "",
                            },
                            after: null,
                        },
                        {
                            entity: permissionBeforeDelete.entity,
                            actions: permissionBeforeDelete.actions,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error(
                        "Failed to create audit log for permission deletion",
                        {
                            error: auditError,
                            permissionId: permissionId as string,
                        }
                    );
                }
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

export default function PermissionsManagement() {
    const { permissions, permissionRoles, currentUser } =
        useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedPermission, setSelectedPermission] = useState<
        (typeof permissions)[0] | null
    >(null);
    const [hideProtected, setHideProtected] = useState(true);
    const [selectedEntity, setSelectedEntity] = useState<string>("");
    const [entityFilter, setEntityFilter] = useState<string>("all");
    const [actionFilter, setActionFilter] = useState<string[]>([]);
    const [assignedRoleFilter, setAssignedRoleFilter] = useState<string>("all");

    // Close modal on successful permission creation
    useEffect(() => {
        if (
            actionData &&
            "success" in actionData &&
            actionData.success &&
            "permission" in actionData
        ) {
            setIsCreateOpen(false);
            setSelectedEntity("");
        }
    }, [actionData]);

    // Close edit modal on successful update
    useEffect(() => {
        if (
            actionData &&
            "success" in actionData &&
            actionData.success &&
            !("permission" in actionData)
        ) {
            setIsEditOpen(false);
            setSelectedPermission(null);
            setSelectedEntity("");
        }
    }, [actionData]);

    // Create a map of permission roles for easy lookup
    const permissionRoleMap = useMemo(() => {
        const map = new Map();
        permissionRoles.forEach((pr) => {
            if (!map.has(pr.permissionId)) {
                map.set(pr.permissionId, []);
            }
            map.get(pr.permissionId).push(pr.roleName);
        });
        return map;
    }, [permissionRoles]);

    // Get unique entities and roles for filters
    const uniqueEntities = useMemo(() => {
        const entities = new Set(
            permissions
                .map((p) => p.entity)
                .filter(
                    (e): e is NonNullable<typeof e> =>
                        e !== null && e !== undefined
                )
        );
        return Array.from(entities).sort();
    }, [permissions]);

    const uniqueRoles = useMemo(() => {
        const roles = new Set(permissionRoles.map((pr) => pr.roleName));
        return Array.from(roles).sort();
    }, [permissionRoles]);

    // Filter permissions based on hideProtected toggle and other filters
    const filteredPermissions = useMemo(() => {
        let filtered = permissions;

        // Filter by hideProtected toggle
        if (hideProtected) {
            filtered = filtered.filter((p) => !p.isCritical && !p.isOwnerOnly);
        }

        // Filter by entity
        if (entityFilter !== "all") {
            filtered = filtered.filter((p) => p.entity === entityFilter);
        }

        // Filter by actions
        if (actionFilter.length > 0) {
            filtered = filtered.filter((p) =>
                p.actions?.some((action) => actionFilter.includes(action))
            );
        }

        // Filter by assigned roles
        if (assignedRoleFilter !== "all") {
            if (assignedRoleFilter === "none") {
                filtered = filtered.filter((p) => {
                    const assignedRoles = permissionRoleMap.get(p.id) || [];
                    return assignedRoles.length === 0;
                });
            } else {
                filtered = filtered.filter((p) => {
                    const assignedRoles = permissionRoleMap.get(p.id) || [];
                    return assignedRoles.includes(assignedRoleFilter);
                });
            }
        }

        return filtered;
    }, [
        permissions,
        hideProtected,
        entityFilter,
        actionFilter,
        assignedRoleFilter,
        permissionRoleMap,
    ]);

    const getPermissionIcon = (isCritical: boolean, isOwnerOnly: boolean) => {
        if (isCritical || isOwnerOnly) {
            return <Crown className="h-4 w-4 text-yellow-600" />;
        }
        return <Shield className="h-4 w-4 text-blue-600" />;
    };

    const getPermissionBadge = (isCritical: boolean, isOwnerOnly: boolean) => {
        if (isCritical || isOwnerOnly) {
            return <Badge variant="destructive">Protected</Badge>;
        }
        return <Badge variant="secondary">Standard</Badge>;
    };

    // Format entity name for display (e.g., "usage_metrics" -> "Usage Metrics")
    const formatEntityName = (entity: string) => {
        return entity
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    // Get available actions for the selected entity
    // audit_logs can only have "retrieve" action (read-only)
    const getAvailableActions = () => {
        if (selectedEntity === "audit_logs") {
            return ["retrieve"];
        }
        return actionEnum.enumValues;
    };

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0 overflow-x-hidden">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-2xl font-medium">
                        Permission Management
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage permissions and their assignments within your
                        account
                    </p>
                </div>
                <Dialog
                    open={isCreateOpen}
                    onOpenChange={(open) => {
                        setIsCreateOpen(open);
                        if (!open) {
                            setSelectedEntity("");
                        }
                    }}
                >
                    <DialogTrigger asChild>
                        <Button>
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Create Permission
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Permission</DialogTitle>
                        </DialogHeader>
                        <Form method="post" className="space-y-4">
                            <input type="hidden" name="intent" value="create" />

                            {/* Error Message */}
                            {actionData &&
                                "success" in actionData &&
                                !actionData.success &&
                                "message" in actionData && (
                                    <ErrorAlert
                                        title="Error"
                                        message={actionData.message}
                                    />
                                )}

                            {/* Success Message */}
                            {actionData &&
                                "success" in actionData &&
                                actionData.success &&
                                "permission" in actionData && (
                                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3">
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                            Permission created successfully!
                                        </p>
                                    </div>
                                )}

                            <div className="space-y-2">
                                <Label htmlFor="entity">Entity</Label>
                                <Select
                                    name="entity"
                                    required
                                    value={selectedEntity}
                                    onValueChange={setSelectedEntity}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select entity" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {entityEnum.enumValues.map((entity) => (
                                            <SelectItem
                                                key={entity}
                                                value={entity}
                                            >
                                                {formatEntityName(entity)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {/* Hidden input to ensure entity is submitted */}
                                {selectedEntity && (
                                    <input
                                        type="hidden"
                                        name="entity"
                                        value={selectedEntity}
                                    />
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Actions</Label>
                                {selectedEntity === "audit_logs" && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Audit logs are immutable and can only be
                                        read. Only the "retrieve" action is
                                        available.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-4">
                                    {getAvailableActions().map((action) => (
                                        <div
                                            key={action}
                                            className="flex items-center space-x-2"
                                        >
                                            <Checkbox
                                                name="actions"
                                                value={action}
                                                id={action}
                                                defaultChecked={
                                                    selectedEntity ===
                                                        "audit_logs" &&
                                                    action === "retrieve"
                                                }
                                            />
                                            <Label
                                                htmlFor={action}
                                                className="capitalize"
                                            >
                                                {action}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input name="description" />
                            </div>

                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={navigation.state === "submitting"}
                                >
                                    {navigation.state === "submitting"
                                        ? "Creating..."
                                        : "Create Permission"}
                                </Button>
                            </DialogFooter>
                        </Form>
                    </DialogContent>
                </Dialog>

                {/* Edit Permission Dialog */}
                <Dialog
                    open={isEditOpen}
                    onOpenChange={(open) => {
                        setIsEditOpen(open);
                        if (!open) {
                            setSelectedPermission(null);
                            setSelectedEntity("");
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Edit Permission</DialogTitle>
                        </DialogHeader>
                        {selectedPermission && (
                            <Form method="post" className="space-y-4">
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="update"
                                />
                                <input
                                    type="hidden"
                                    name="permissionId"
                                    value={selectedPermission.id}
                                />

                                {/* Error Message */}
                                {actionData &&
                                    "success" in actionData &&
                                    !actionData.success &&
                                    "message" in actionData && (
                                        <ErrorAlert
                                            title="Error"
                                            message={actionData.message}
                                        />
                                    )}

                                {/* Success Message */}
                                {actionData &&
                                    "success" in actionData &&
                                    actionData.success &&
                                    !("permission" in actionData) && (
                                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3">
                                            <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                                Permission updated successfully!
                                            </p>
                                        </div>
                                    )}

                                <div className="space-y-2">
                                    <Label htmlFor="edit-entity">Entity</Label>
                                    <Select
                                        name="entity"
                                        required
                                        value={selectedEntity}
                                        onValueChange={setSelectedEntity}
                                        disabled={
                                            selectedPermission.isCritical ||
                                            false ||
                                            selectedPermission.isOwnerOnly ||
                                            false
                                        }
                                    >
                                        <SelectTrigger id="edit-entity">
                                            <SelectValue placeholder="Select entity" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {entityEnum.enumValues.map(
                                                (entity) => (
                                                    <SelectItem
                                                        key={entity}
                                                        value={entity}
                                                    >
                                                        {formatEntityName(
                                                            entity
                                                        )}
                                                    </SelectItem>
                                                )
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {/* Hidden input to ensure entity is submitted */}
                                    {selectedEntity && (
                                        <input
                                            type="hidden"
                                            name="entity"
                                            value={selectedEntity}
                                        />
                                    )}
                                    {(selectedPermission.isCritical ||
                                        selectedPermission.isOwnerOnly) && (
                                        <p className="text-xs text-muted-foreground">
                                            Entity cannot be changed for
                                            protected permissions
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Actions</Label>
                                    {selectedEntity === "audit_logs" && (
                                        <p className="text-sm text-muted-foreground mb-2">
                                            Audit logs are immutable and can
                                            only be read. Only the "retrieve"
                                            action is available.
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-4">
                                        {getAvailableActions().map((action) => (
                                            <div
                                                key={action}
                                                className="flex items-center space-x-2"
                                            >
                                                <Checkbox
                                                    name="actions"
                                                    value={action}
                                                    id={`edit-${action}`}
                                                    defaultChecked={
                                                        selectedPermission.actions?.includes(
                                                            action as ActionType
                                                        ) ||
                                                        (selectedEntity ===
                                                            "audit_logs" &&
                                                            action ===
                                                                "retrieve")
                                                    }
                                                    disabled={
                                                        selectedPermission.isCritical ||
                                                        false ||
                                                        selectedPermission.isOwnerOnly ||
                                                        false
                                                    }
                                                />
                                                <Label
                                                    htmlFor={`edit-${action}`}
                                                    className="capitalize"
                                                >
                                                    {action}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    {(selectedPermission.isCritical ||
                                        selectedPermission.isOwnerOnly) && (
                                        <p className="text-xs text-muted-foreground">
                                            Actions cannot be changed for
                                            protected permissions
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-description">
                                        Description
                                    </Label>
                                    <Input
                                        name="description"
                                        id="edit-description"
                                        defaultValue={
                                            selectedPermission.description || ""
                                        }
                                        disabled={
                                            selectedPermission.isCritical ||
                                            false ||
                                            selectedPermission.isOwnerOnly ||
                                            false
                                        }
                                    />
                                </div>

                                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                                    <div className="w-full sm:w-auto">
                                        <Form method="post">
                                            <input
                                                type="hidden"
                                                name="intent"
                                                value="delete"
                                            />
                                            <input
                                                type="hidden"
                                                name="permissionId"
                                                value={selectedPermission.id}
                                            />
                                            <Button
                                                type="submit"
                                                variant="destructive"
                                                disabled={
                                                    navigation.state ===
                                                        "submitting" ||
                                                    selectedPermission.isCritical ||
                                                    false ||
                                                    selectedPermission.isOwnerOnly ||
                                                    false ||
                                                    (
                                                        permissionRoleMap.get(
                                                            selectedPermission.id
                                                        ) || []
                                                    ).length > 0
                                                }
                                                title={
                                                    selectedPermission.isCritical ||
                                                    false ||
                                                    selectedPermission.isOwnerOnly ||
                                                    false
                                                        ? "Cannot delete protected permissions"
                                                        : (
                                                                permissionRoleMap.get(
                                                                    selectedPermission.id
                                                                ) || []
                                                            ).length > 0
                                                          ? `Cannot delete permission assigned to ${
                                                                (
                                                                    permissionRoleMap.get(
                                                                        selectedPermission.id
                                                                    ) || []
                                                                ).length
                                                            } role${
                                                                (
                                                                    permissionRoleMap.get(
                                                                        selectedPermission.id
                                                                    ) || []
                                                                ).length > 1
                                                                    ? "s"
                                                                    : ""
                                                            }`
                                                          : "Delete permission"
                                                }
                                                onClick={(e) => {
                                                    if (
                                                        !confirm(
                                                            "Are you sure you want to delete this permission? This action cannot be undone."
                                                        )
                                                    ) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                                className="w-full sm:w-auto"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Remove Permission
                                            </Button>
                                        </Form>
                                    </div>
                                    <div className="w-full sm:w-auto">
                                        <Button
                                            type="submit"
                                            disabled={
                                                navigation.state ===
                                                    "submitting" ||
                                                selectedPermission.isCritical ||
                                                false ||
                                                selectedPermission.isOwnerOnly ||
                                                false
                                            }
                                        >
                                            {navigation.state === "submitting"
                                                ? "Updating..."
                                                : "Update Permission"}
                                        </Button>
                                    </div>
                                </DialogFooter>
                            </Form>
                        )}
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Permission Protection Section */}
                    <div className="space-y-4">
                        <div className="bg-accent/50 text-accent-foreground rounded-lg p-6">
                            <h4 className="text-md font-semibold mb-4">
                                Permission Protection
                            </h4>
                            <p className="text-sm text-muted-foreground mb-4">
                                Critical permissions are protected and cannot be
                                modified. These are essential for system
                                security.
                            </p>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="hideProtected"
                                    checked={hideProtected}
                                    onCheckedChange={(checked) =>
                                        setHideProtected(checked as boolean)
                                    }
                                />
                                <Label
                                    htmlFor="hideProtected"
                                    className="text-sm"
                                >
                                    Hide protected permissions
                                </Label>
                            </div>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Filters */}
                    <div className="space-y-4 mb-6">
                        <div className="flex flex-col gap-4 items-start">
                            <div className="flex gap-8 items-center">
                                <div className="flex items-start gap-2 flex-col">
                                    <Label
                                        htmlFor="entityFilter"
                                        className="text-sm font-medium"
                                    >
                                        Filter by Entity:
                                    </Label>
                                    <Select
                                        value={entityFilter}
                                        onValueChange={setEntityFilter}
                                    >
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">
                                                All Entities
                                            </SelectItem>
                                            {uniqueEntities.map((entity) => {
                                                if (!entity) return null;
                                                return (
                                                    <SelectItem
                                                        key={entity}
                                                        value={entity}
                                                    >
                                                        {formatEntityName(
                                                            entity
                                                        )}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-start flex-col gap-2">
                                    <Label
                                        htmlFor="assignedRoleFilter"
                                        className="text-sm font-medium"
                                    >
                                        Filter by Role:
                                    </Label>
                                    <Select
                                        value={assignedRoleFilter}
                                        onValueChange={setAssignedRoleFilter}
                                    >
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">
                                                All Roles
                                            </SelectItem>
                                            <SelectItem value="none">
                                                No Roles Assigned
                                            </SelectItem>
                                            {uniqueRoles.map((role) => (
                                                <SelectItem
                                                    key={role}
                                                    value={role}
                                                >
                                                    {role}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-sm font-medium">
                                    Filter by Actions:
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    {actionEnum.enumValues.map((action) => {
                                        const isSelected =
                                            actionFilter.includes(action);
                                        return (
                                            <Button
                                                key={action}
                                                variant={
                                                    isSelected
                                                        ? "default"
                                                        : "outline"
                                                }
                                                size="sm"
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setActionFilter(
                                                            actionFilter.filter(
                                                                (a) =>
                                                                    a !== action
                                                            )
                                                        );
                                                    } else {
                                                        setActionFilter([
                                                            ...actionFilter,
                                                            action,
                                                        ]);
                                                    }
                                                }}
                                                className="h-8"
                                            >
                                                {action
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                    action.slice(1)}
                                            </Button>
                                        );
                                    })}
                                    {actionFilter.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setActionFilter([])}
                                            className="h-8 text-muted-foreground"
                                        >
                                            <X className="h-3 w-3 mr-1" />
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {(entityFilter !== "all" ||
                            actionFilter.length > 0 ||
                            assignedRoleFilter !== "all") && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setEntityFilter("all");
                                        setActionFilter([]);
                                        setAssignedRoleFilter("all");
                                    }}
                                    className="text-muted-foreground"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Clear Filters
                                </Button>
                                {actionFilter.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {actionFilter.map((action) => (
                                            <Badge
                                                key={action}
                                                variant="secondary"
                                                className="text-xs"
                                            >
                                                {action}
                                                <button
                                                    onClick={() => {
                                                        setActionFilter(
                                                            actionFilter.filter(
                                                                (a) =>
                                                                    a !== action
                                                            )
                                                        );
                                                    }}
                                                    className="ml-1 hover:text-destructive"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <Table className="border rounded-lg">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Permission</TableHead>
                                <TableHead>Entity</TableHead>
                                <TableHead>Actions</TableHead>
                                <TableHead>Assigned Roles</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPermissions.map((permission) => {
                                const assignedRoles =
                                    permissionRoleMap.get(permission.id) || [];

                                return (
                                    <TableRow key={permission.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getPermissionIcon(
                                                    permission.isCritical ||
                                                        false,
                                                    permission.isOwnerOnly ||
                                                        false
                                                )}
                                                <div>
                                                    <div className="font-medium">
                                                        {permission.entity}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {permission.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {permission.entity}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {permission.actions?.map(
                                                    (action) => (
                                                        <Badge
                                                            key={action}
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            {action}
                                                        </Badge>
                                                    )
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {assignedRoles.length > 0 ? (
                                                    assignedRoles
                                                        .slice(0, 3)
                                                        .map(
                                                            (
                                                                roleName: string
                                                            ) => (
                                                                <Badge
                                                                    key={
                                                                        roleName
                                                                    }
                                                                    variant="outline"
                                                                    className="text-xs"
                                                                >
                                                                    {roleName}
                                                                </Badge>
                                                            )
                                                        )
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">
                                                        No roles
                                                    </span>
                                                )}
                                                {assignedRoles.length > 3 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        +
                                                        {assignedRoles.length -
                                                            3}{" "}
                                                        more
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {getPermissionBadge(
                                                permission.isCritical || false,
                                                permission.isOwnerOnly || false
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedPermission(
                                                            permission
                                                        );
                                                        setSelectedEntity(
                                                            permission.entity ||
                                                                ""
                                                        );
                                                        setIsEditOpen(true);
                                                    }}
                                                    disabled={
                                                        permission.isCritical ||
                                                        false ||
                                                        permission.isOwnerOnly ||
                                                        false
                                                    }
                                                    title={
                                                        permission.isCritical ||
                                                        permission.isOwnerOnly
                                                            ? "Cannot edit protected permissions"
                                                            : "Edit permission"
                                                    }
                                                >
                                                    <Pencil className="h-4 w-4 mr-1" />
                                                    Update
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {filteredPermissions.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        {entityFilter !== "all" ||
                        actionFilter.length > 0 ||
                        assignedRoleFilter !== "all"
                            ? "No permissions found matching the selected filters."
                            : hideProtected
                              ? "No standard permissions found. Uncheck 'Hide protected permissions' to see all permissions."
                              : "No permissions found. Create your first permission to get started."}
                    </p>
                </div>
            )}
        </div>
    );
}
