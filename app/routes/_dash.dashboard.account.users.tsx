import {
    Form,
    Link,
    redirect,
    useLoaderData,
    useActionData,
    useNavigation,
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router";

import { users, roleUsers, userInvitations } from "~/lib/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { Button } from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import {
    Shield,
    User,
    Crown,
    Settings,
    Archive,
    RotateCcw,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from "lucide-react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { isNotDeleted } from "~/lib/db/soft-delete.server";
import { Label } from "~/components/ui/label";

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const {
        getManageableUsers,
        getManageableRoles,
        requirePermission,
        hasPermission,
    } = await import("~/lib/permissions.server");
    const { getCsrfToken } = await import("~/lib/csrf.server");
    const { appUser } = await requirePermission(request, "users", "retrieve");

    // Check if user has permission to update users (for showing manage buttons)
    const canUpdateUsers = await hasPermission(appUser.id, "users", "update");

    // Get manageable users (filtered by hierarchy) - only active users
    const manageableUsers = await getManageableUsers(
        appUser.id,
        appUser.accountId
    );

    // Get manageable roles (filtered by hierarchy)
    const manageableRoles = await getManageableRoles(appUser.id);

    const roleUserAssociations = await db
        .select({
            userId: roleUsers.userId,
            roleId: roleUsers.roleId,
        })
        .from(roleUsers)
        .innerJoin(users, eq(roleUsers.userId, users.id))
        .where(
            and(eq(users.accountId, appUser.accountId), isNotDeleted(users))
        );

    // Get archived (soft-deleted) users if user has permission
    const canViewArchived = await hasPermission(
        appUser.id,
        "users",
        "retrieve"
    );
    let archivedUsers: typeof manageableUsers = [];

    if (
        canViewArchived &&
        (appUser.role === "owner" || appUser.role === "admin")
    ) {
        // Get all soft-deleted users in the account
        const allArchivedUsers = await db
            .select()
            .from(users)
            .where(
                and(
                    eq(users.accountId, appUser.accountId),
                    isNotNull(users.deletedAt)
                )
            );

        // Filter by manageable users (hierarchy check)
        const { getUserEffectiveAccessLevel } =
            await import("~/lib/permissions.server");
        const { roles: rolesTable } = await import("~/lib/db/schema");
        const currentUserLevel = await getUserEffectiveAccessLevel(appUser.id);
        const baseRoleLevels: Record<string, number> = {
            owner: 2,
            admin: 1,
            user: 0,
        };

        // Get custom role assignments for archived users
        const archivedRoleAssignments = await db
            .select({
                userId: roleUsers.userId,
                accessLevel: rolesTable.accessLevel,
            })
            .from(roleUsers)
            .innerJoin(rolesTable, eq(roleUsers.roleId, rolesTable.id))
            .innerJoin(users, eq(roleUsers.userId, users.id))
            .where(
                and(
                    eq(users.accountId, appUser.accountId),
                    isNotNull(users.deletedAt)
                )
            );

        const userCustomLevels = new Map<string, number>();
        for (const assignment of archivedRoleAssignments) {
            const currentMax = userCustomLevels.get(assignment.userId) ?? -1;
            userCustomLevels.set(
                assignment.userId,
                Math.max(currentMax, assignment.accessLevel)
            );
        }

        archivedUsers = allArchivedUsers.filter((user) => {
            if (user.id === appUser.id) return false;
            const baseLevel = baseRoleLevels[user.role] ?? -1;
            const maxCustomLevel = userCustomLevels.get(user.id) ?? -1;
            const userEffectiveLevel = Math.max(baseLevel, maxCustomLevel);
            return currentUserLevel > userEffectiveLevel;
        });
    }

    const csrfToken = await getCsrfToken(request);

    return {
        users: manageableUsers,
        archivedUsers,
        roles: manageableRoles,
        roleUsers: roleUserAssociations,
        currentUser: appUser,
        csrfToken,
        canUpdateUsers,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { requirePermission, hasPermission } =
        await import("~/lib/permissions.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { auditUserAction } = await import("~/lib/audit/server");

    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createActionErrorResponse("Invalid CSRF token", 403);
        }
        throw error;
    }

    const { appUser } = await requirePermission(request, "users", "update");
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "restore") {
        const userId = formData.get("userId") as string;

        if (!userId) {
            return createActionErrorResponse("User ID is required", 400);
        }

        // Check if user has permission to restore users
        const canRestore = await hasPermission(appUser.id, "users", "update");
        if (
            !canRestore ||
            (appUser.role !== "owner" && appUser.role !== "admin")
        ) {
            return createActionErrorResponse(
                "Insufficient privileges to restore users",
                403
            );
        }

        // Get the archived user
        const archivedUser = await db.query.users.findFirst({
            where: and(
                eq(users.id, userId),
                eq(users.accountId, appUser.accountId),
                isNotNull(users.deletedAt)
            ),
        });

        if (!archivedUser) {
            return createActionErrorResponse("Archived user not found", 404);
        }

        // Use transaction to restore user and handle invitations
        let restoredUser;
        try {
            restoredUser = await db.transaction(async (tx) => {
                // Restore the user - explicitly set deletedAt to null
                const userUpdateResult = await tx
                    .update(users)
                    .set({
                        deletedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(users.id, userId),
                            eq(users.accountId, appUser.accountId),
                            isNotNull(users.deletedAt)
                        )
                    )
                    .returning({ id: users.id, deletedAt: users.deletedAt });

                // Verify the update succeeded
                if (
                    userUpdateResult.length === 0 ||
                    userUpdateResult[0].deletedAt !== null
                ) {
                    throw new Error(
                        "Failed to restore user. User may not be archived or update failed."
                    );
                }

                // Restore user's soft-deleted role assignments
                await tx
                    .update(roleUsers)
                    .set({
                        deletedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(roleUsers.userId, userId),
                            isNotNull(roleUsers.deletedAt)
                        )
                    );

                // Downgrade any accepted invitations for this user's email to pending
                // This allows the invitation to be re-issued if needed
                const associatedInvitations =
                    await tx.query.userInvitations.findMany({
                        where: and(
                            eq(userInvitations.email, archivedUser.email),
                            eq(userInvitations.accountId, appUser.accountId),
                            eq(userInvitations.status, "accepted")
                        ),
                    });

                if (associatedInvitations.length > 0) {
                    await tx
                        .update(userInvitations)
                        .set({
                            status: "pending",
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                eq(userInvitations.email, archivedUser.email),
                                eq(
                                    userInvitations.accountId,
                                    appUser.accountId
                                ),
                                eq(userInvitations.status, "accepted")
                            )
                        );
                }

                return userUpdateResult[0];
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to restore user";
            return createActionErrorResponse(message, 400);
        }

        // Log to audit_logs
        await auditUserAction(
            appUser,
            "user.restored",
            "users",
            userId,
            {
                before: {
                    email: archivedUser.email,
                    role: archivedUser.role,
                    deletedAt: archivedUser.deletedAt?.toISOString() || null,
                },
                after: {
                    email: archivedUser.email,
                    role: archivedUser.role,
                    deletedAt: restoredUser.deletedAt,
                },
            },
            {
                restoredBy: appUser.email,
            }
        );

        // Notify user of restoration
        try {
            const { createNotification } =
                await import("~/lib/notifications/server");
            await createNotification({
                accountId: appUser.accountId,
                userId: userId,
                type: "success",
                title: "Account Access Restored",
                message: `Your access to this account has been restored by ${appUser.email}.`,
                actionUrl: "/dashboard",
                actionLabel: "Go to Dashboard",
            });
        } catch (notificationError) {
            // Log notification error but don't fail the operation
            const { logger } = await import("~/lib/logging.server");
            logger.error("Failed to send user restoration notification", {
                error: notificationError,
                userId: userId,
            });
        }

        return { success: true, message: "User restored successfully" };
    }

    return createActionErrorResponse("Invalid action", 400);
}

export default function UsersManagement() {
    const {
        users,
        archivedUsers,
        roles,
        roleUsers,
        currentUser,
        csrfToken,
        canUpdateUsers,
    } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [showArchived, setShowArchived] = useState(false);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Create a map of user roles for easy lookup
    const userRoles = useMemo(() => {
        const map = new Map<string, string[]>();
        roleUsers.forEach((ru) => {
            if (!map.has(ru.userId)) {
                map.set(ru.userId, []);
            }
            const roles = map.get(ru.userId);
            if (roles) {
                roles.push(ru.roleId);
            }
        });
        return map;
    }, [roleUsers]);

    // Create a map of role names for display
    const roleNames = useMemo(() => {
        const map = new Map<string, string>();
        roles.forEach((role) => {
            map.set(role.id, role.name);
        });
        return map;
    }, [roles]);

    // Create a map of role IDs to access levels
    const roleAccessLevels = useMemo(() => {
        const map = new Map<string, number>();
        roles.forEach((role) => {
            map.set(role.id, role.accessLevel);
        });
        return map;
    }, [roles]);

    // Base role access levels
    const baseRoleLevels: Record<string, number> = {
        owner: 2,
        admin: 1,
        user: 0,
    };

    // Calculate effective access level for each user and sort
    const sortedUsers = useMemo(() => {
        const usersWithLevels = users.map((user) => {
            // Get base role level
            const baseLevel = baseRoleLevels[user.role] ?? -1;

            // Get custom role levels
            const userRoleIds = userRoles.get(user.id) || [];
            const customLevels = userRoleIds
                .map((roleId) => roleAccessLevels.get(roleId) ?? -1)
                .filter((level) => level >= 0);

            // Effective level is the max of base and custom levels
            const maxCustomLevel =
                customLevels.length > 0 ? Math.max(...customLevels) : -1;
            const effectiveLevel = Math.max(baseLevel, maxCustomLevel);

            return { user, effectiveLevel };
        });

        // Sort by effective level
        const sorted = [...usersWithLevels].sort((a, b) => {
            if (sortOrder === "asc") {
                return a.effectiveLevel - b.effectiveLevel;
            } else {
                return b.effectiveLevel - a.effectiveLevel;
            }
        });

        return sorted.map((item) => item.user);
    }, [users, userRoles, roleAccessLevels, sortOrder]);

    const getRoleIcon = (role: string) => {
        switch (role) {
            case "owner":
                return <Crown className="h-4 w-4 text-yellow-600" />;
            case "admin":
                return <Shield className="h-4 w-4 text-blue-600" />;
            default:
                return <User className="h-4 w-4 text-gray-600" />;
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case "owner":
                return (
                    <Badge
                        variant="secondary"
                        className="bg-yellow-100 text-yellow-800"
                    >
                        Owner
                    </Badge>
                );
            case "admin":
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
    };

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">User Management</h3>
                <p className="text-sm text-muted-foreground">
                    Manage users and their roles within your account
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Role Hierarchy Section */}
                    <div className="space-y-4">
                        <div className="bg-accent/50 text-accent-foreground rounded-lg p-6">
                            <h4 className="text-md font-semibold mb-4">
                                Role Hierarchy
                            </h4>
                            <p className="text-sm text-muted-foreground">
                                Users can only manage those below them in the
                                hierarchy. Owners are protected and cannot be
                                modified by other users.
                            </p>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Sort Control */}
                    <div className="flex items-center justify-end mb-4">
                        <div className="flex items-center gap-2">
                            <Label
                                htmlFor="sortOrder"
                                className="text-sm font-medium"
                            >
                                Sort by Role Level:
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

                    <Table className="border rounded-lg">
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role Level</TableHead>
                                <TableHead>Assigned Roles</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedUsers.map((user) => {
                                const userRoleIds =
                                    userRoles.get(user.id) || [];
                                const userRoleNames = userRoleIds
                                    .map((roleId: string) =>
                                        roleNames.get(roleId)
                                    )
                                    .filter(Boolean);

                                return (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getRoleIcon(user.role)}
                                                <div>
                                                    <div className="font-medium">
                                                        {user.email}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {user.role}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {getRoleBadge(user.role)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {userRoleNames.length > 0 ? (
                                                    userRoleNames.map(
                                                        (
                                                            roleName:
                                                                | string
                                                                | undefined
                                                        ) =>
                                                            roleName ? (
                                                                <Badge
                                                                    key={
                                                                        roleName
                                                                    }
                                                                    variant="outline"
                                                                >
                                                                    {roleName}
                                                                </Badge>
                                                            ) : (
                                                                <Badge
                                                                    variant="destructive"
                                                                    className="text-xs"
                                                                >
                                                                    No role
                                                                </Badge>
                                                            )
                                                    )
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">
                                                        No custom roles
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {canUpdateUsers ? (
                                                <Link
                                                    to={`/dashboard/account/users/${user.id}/manage`}
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={
                                                            user.id ===
                                                                currentUser.id ||
                                                            user.role ===
                                                                "owner"
                                                        }
                                                    >
                                                        <Settings className="h-4 w-4 mr-2" />
                                                        Manage
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <Link
                                                    to={`/dashboard/account/users/${user.id}/manage`}
                                                >
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                    >
                                                        <Settings className="h-4 w-4 mr-2" />
                                                        View
                                                    </Button>
                                                </Link>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>

                {/* Table extends to card border */}
            </Card>

            {sortedUsers.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        No manageable users found. You can only manage users
                        below your access level.
                    </p>
                </div>
            )}

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

            {/* Archived Users Section */}
            {archivedUsers.length > 0 &&
                (currentUser.role === "owner" ||
                    currentUser.role === "admin") && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                                        <Archive className="h-5 w-5" />
                                        Archived Users
                                    </CardTitle>
                                    <CardDescription>
                                        Users that have been removed from the
                                        account
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        setShowArchived(!showArchived)
                                    }
                                >
                                    {showArchived ? "Hide" : "Show"} Archived (
                                    {archivedUsers.length})
                                </Button>
                            </div>
                        </CardHeader>
                        {showArchived && (
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User</TableHead>
                                                <TableHead>
                                                    Role Level
                                                </TableHead>
                                                <TableHead>
                                                    Archived Date
                                                </TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {archivedUsers.map((user) => {
                                                return (
                                                    <TableRow
                                                        key={user.id}
                                                        className="opacity-75"
                                                    >
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                {getRoleIcon(
                                                                    user.role
                                                                )}
                                                                <div>
                                                                    <div className="font-medium">
                                                                        {
                                                                            user.email
                                                                        }
                                                                    </div>
                                                                    <div className="text-sm text-muted-foreground">
                                                                        {
                                                                            user.role
                                                                        }
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {getRoleBadge(
                                                                user.role
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {user.deletedAt ? (
                                                                <span className="text-sm text-muted-foreground">
                                                                    {new Date(
                                                                        user.deletedAt
                                                                    ).toLocaleDateString()}
                                                                </span>
                                                            ) : (
                                                                <span className="text-sm text-muted-foreground">
                                                                    Unknown
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
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
                                                                    value="restore"
                                                                />
                                                                <input
                                                                    type="hidden"
                                                                    name="userId"
                                                                    value={
                                                                        user.id
                                                                    }
                                                                />
                                                                <Button
                                                                    type="submit"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    disabled={
                                                                        navigation.state ===
                                                                        "submitting"
                                                                    }
                                                                >
                                                                    <RotateCcw className="h-4 w-4 mr-2" />
                                                                    Restore
                                                                </Button>
                                                            </Form>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                )}
        </div>
    );
}
