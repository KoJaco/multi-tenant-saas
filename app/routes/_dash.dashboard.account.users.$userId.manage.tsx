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
import { users, roleUsers, roles, userInvitations } from "~/lib/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
    ArrowLeft,
    Shield,
    ShieldCheck,
    ShieldOff,
    User,
    Crown,
    Mail,
    Calendar,
    Key,
    Trash2,
} from "lucide-react";
import { isPostgresError } from "~/lib/auth/errors.server";
import { ErrorAlert } from "~/components/ui/error-alert";
import { useState } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const {
        requirePermission,
        canManageUser,
        getManageableRoles,
        hasPermission,
    } = await import("~/lib/permissions.server");
    const { getMfaStatus } = await import("~/lib/auth/mfa.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { getCsrfTokenWithHeaders } = await import("~/lib/csrf.server");

    const { appUser } = await requirePermission(request, "users", "retrieve");
    const userId = params.userId;
    const { token: csrfToken, headers: csrfHeaders } =
        await getCsrfTokenWithHeaders(request);

    if (!userId) {
        throw redirect("/dashboard/account/users");
    }

    // Check if current user can manage target user
    const canManage = await canManageUser(appUser.id, userId);
    if (!canManage) {
        throw createActionErrorResponse(
            "Insufficient privileges to manage this user",
            403
        );
    }

    // Get target user
    const targetUser = await db.query.users.findFirst({
        where: and(
            eq(users.id, userId),
            eq(users.accountId, appUser.accountId)
        ),
    });

    if (!targetUser) {
        throw createActionErrorResponse("User not found", 404);
    }

    // Get manageable roles
    const manageableRoles = await getManageableRoles(appUser.id);

    // Get user's current role assignments
    const userRoleAssignments = await db
        .select({
            roleId: roleUsers.roleId,
            roleName: roles.name,
            roleDescription: roles.description,
        })
        .from(roleUsers)
        .innerJoin(roles, eq(roleUsers.roleId, roles.id))
        .where(eq(roleUsers.userId, userId));

    // Get MFA status
    const mfaStatus = await getMfaStatus(userId);

    // Check if user has permission to update users (for showing edit sections)
    const canUpdateUsers = await hasPermission(appUser.id, "users", "update");

    // Check if user has permission to delete users
    const canDeleteUser = await hasPermission(appUser.id, "users", "delete");

    return Response.json(
        {
            targetUser,
            manageableRoles,
            userRoleAssignments,
            mfaStatus,
            currentUser: appUser,
            csrfToken,
            canUpdateUsers,
            canDeleteUser,
        },
        { headers: csrfHeaders }
    );
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { canManageUser, isProtectedUser, canAssignRole, requirePermission } =
        await import("~/lib/permissions.server");
    const { logger } = await import("~/lib/logging.server");
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

    const { appUser } = await requirePermission(request, "users", "update");
    const userId = params.userId;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (!userId) {
        return createActionErrorResponse("User ID is required", 400);
    }

    // Check if current user can manage target user
    const canManage = await canManageUser(appUser.id, userId);
    if (!canManage) {
        return createActionErrorResponse(
            "Insufficient privileges to manage this user",
            403
        );
    }

    // Verify user belongs to the same account
    const targetUser = await db.query.users.findFirst({
        where: and(
            eq(users.id, userId),
            eq(users.accountId, appUser.accountId)
        ),
        columns: { id: true, accountId: true, role: true },
    });

    if (!targetUser) {
        return createActionErrorResponse("User not found", 404);
    }

    try {
        if (intent === "assign-role") {
            const roleId = formData.get("roleId") as string;

            if (!roleId) {
                return createActionErrorResponse("Role ID is required", 400);
            }

            // Verify role belongs to the same account
            const targetRole = await db.query.roles.findFirst({
                where: and(
                    eq(roles.id, roleId),
                    eq(roles.accountId, appUser.accountId)
                ),
                columns: { id: true, accountId: true },
            });

            if (!targetRole) {
                return createActionErrorResponse(
                    "Role not found or access denied",
                    404
                );
            }

            // Check if target user is protected (owner)
            if (await isProtectedUser(userId)) {
                return createActionErrorResponse(
                    "Cannot modify owner user roles",
                    403
                );
            }

            // Check if current user can assign this role to this user
            const canAssign = await canAssignRole(appUser.id, roleId, userId);

            if (!canAssign) {
                return createActionErrorResponse(
                    "Insufficient privileges to assign this role",
                    403
                );
            }

            // Get previous role assignments before transaction
            const previousRoleAssignments = await db
                .select({
                    roleId: roleUsers.roleId,
                    roleName: roles.name,
                })
                .from(roleUsers)
                .innerJoin(roles, eq(roleUsers.roleId, roles.id))
                .where(eq(roleUsers.userId, userId));

            // Use transaction to make role assignment atomic
            await db.transaction(async (tx) => {
                // Remove existing role assignments for this user
                await tx.delete(roleUsers).where(
                    sql`${roleUsers.userId} = ${userId} 
                            AND EXISTS (
                                SELECT 1 FROM ${users} 
                                WHERE ${users.id} = ${roleUsers.userId} 
                                AND ${users.accountId} = ${appUser.accountId}
                            )`
                );

                try {
                    // Assign the new role
                    await tx.insert(roleUsers).values({
                        userId: userId,
                        roleId: roleId,
                    });
                } catch (error: unknown) {
                    if (isPostgresError(error) && error.code === "23505") {
                        logger.info("Role already assigned to this user.", {
                            userId: userId,
                            roleId: roleId,
                        });
                    } else {
                        throw error;
                    }
                }
            });

            // Get new role details for audit log
            const newRole = await db.query.roles.findFirst({
                where: eq(roles.id, roleId),
                columns: { name: true },
            });
            const targetUserForAudit = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: { email: true },
            });

            // Log role assignment to audit logs
            try {
                const { auditUserAction } = await import("~/lib/audit/server");
                await auditUserAction(
                    appUser,
                    "user.role_assigned",
                    "users",
                    userId,
                    {
                        before: {
                            roles: previousRoleAssignments.map((r) => ({
                                roleId: r.roleId,
                                roleName: r.roleName,
                            })),
                        },
                        after: {
                            roles: [
                                {
                                    roleId: roleId,
                                    roleName: newRole?.name || "Unknown",
                                },
                            ],
                        },
                    },
                    {
                        roleId: roleId,
                        roleName: newRole?.name || "Unknown",
                        userEmail: targetUserForAudit?.email || "Unknown",
                    }
                );
            } catch (auditError) {
                // Log audit error but don't fail the operation
                logger.error("Failed to create audit log for role assignment", {
                    error: auditError,
                    userId: userId,
                    roleId: roleId,
                });
            }

            // Notify user of role assignment
            try {
                const { notifyRoleAssigned } = await import(
                    "~/lib/notifications/helpers.server"
                );
                await notifyRoleAssigned(
                    appUser.accountId,
                    userId,
                    newRole?.name || "Unknown",
                    appUser.email
                );
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                logger.error("Failed to send role assignment notification", {
                    error: notificationError,
                    userId: userId,
                    roleId: roleId,
                });
            }

            return { success: true, message: "Role assigned successfully" };
        }

        if (intent === "remove") {
            const confirmationText = formData.get("confirmationText") as string;
            const reason = formData.get("reason") as string;

            // Validate confirmation text
            if (confirmationText !== "Remove User") {
                return createActionErrorResponse(
                    "Confirmation text must be exactly 'Remove User'",
                    400
                );
            }

            // Validate reason
            if (!reason || reason.trim().length === 0) {
                return createActionErrorResponse(
                    "A reason for removal is required",
                    400
                );
            }

            if (reason.trim().length < 10) {
                return createActionErrorResponse(
                    "Reason must be at least 10 characters long",
                    400
                );
            }

            // Don't allow removing yourself
            if (userId === appUser.id) {
                return createActionErrorResponse(
                    "Cannot remove yourself from the account",
                    400
                );
            }

            // Check if target user is protected (owner)
            if (await isProtectedUser(userId)) {
                return createActionErrorResponse(
                    "Cannot remove owner users",
                    403
                );
            }

            // Don't allow removing the last owner
            if (targetUser.role === "owner") {
                const ownerCount = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(users)
                    .where(
                        and(
                            eq(users.accountId, appUser.accountId),
                            eq(users.role, "owner"),
                            isNull(users.deletedAt)
                        )
                    );

                const count = ownerCount[0]?.count ?? 0;

                if (count <= 1) {
                    return createActionErrorResponse(
                        "Cannot remove the last owner from the account",
                        409
                    );
                }
            }

            // Get user details before soft-deleting for audit log
            const userToRemove = await db.query.users.findFirst({
                where: and(
                    eq(users.id, userId),
                    eq(users.accountId, appUser.accountId),
                    isNull(users.deletedAt)
                ),
            });

            if (!userToRemove) {
                return createActionErrorResponse(
                    "User not found or already removed",
                    404
                );
            }

            // Use transaction to ensure atomicity
            await db.transaction(async (tx) => {
                // Soft delete user's roles (set deletedAt)
                await tx
                    .update(roleUsers)
                    .set({
                        deletedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(
                        sql`${roleUsers.userId} = ${userId} 
                            AND EXISTS (
                                SELECT 1 FROM ${users} 
                                WHERE ${users.id} = ${roleUsers.userId} 
                                AND ${users.accountId} = ${appUser.accountId}
                            )
                            AND ${roleUsers.deletedAt} IS NULL`
                    );

                // Soft delete the user
                await tx
                    .update(users)
                    .set({
                        deletedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(users.id, userId),
                            eq(users.accountId, appUser.accountId),
                            isNull(users.deletedAt)
                        )
                    );
            });

            // Log to audit_logs
            const { auditUserAction } = await import("~/lib/audit/server");
            await auditUserAction(
                appUser,
                "user.deleted",
                "users",
                userId,
                {
                    before: {
                        email: userToRemove.email,
                        role: userToRemove.role,
                        deletedAt: null,
                    },
                    after: {
                        email: userToRemove.email,
                        role: userToRemove.role,
                        deletedAt: new Date().toISOString(),
                    },
                },
                {
                    reason: reason.trim(),
                    removedBy: appUser.email,
                }
            );

            // Notify user of removal (before redirect)
            try {
                const { createNotification } = await import(
                    "~/lib/notifications/server"
                );
                await createNotification({
                    accountId: appUser.accountId,
                    userId: userId,
                    type: "warning",
                    title: "Account Access Removed",
                    message: `Your access to this account has been removed by ${appUser.email}. Reason: ${reason.trim()}`,
                    actionUrl: null, // User can't access dashboard anymore
                });
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                logger.error("Failed to send user removal notification", {
                    error: notificationError,
                    userId: userId,
                });
            }

            // Redirect to users list after successful removal
            throw redirect("/dashboard/account/users");
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

function RemoveUserDialog({
    userId,
    userEmail,
    csrfToken,
    isSubmitting,
}: {
    userId: string;
    userEmail: string;
    csrfToken: string;
    isSubmitting: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [reason, setReason] = useState("");
    const requiredText = "Remove User";
    const canSubmit =
        confirmationText === requiredText && reason.trim().length >= 10;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" disabled={isSubmitting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove User
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Remove User</DialogTitle>
                    <DialogDescription>
                        This will soft-delete {userEmail} from the account. The
                        user will be removed but their data will be retained for
                        audit purposes.
                    </DialogDescription>
                </DialogHeader>
                <Form method="post" className="space-y-4">
                    <input type="hidden" name="csrf_token" value={csrfToken} />
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="userId" value={userId} />

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
                            value={confirmationText}
                            onChange={(e) =>
                                setConfirmationText(e.target.value)
                            }
                            placeholder={requiredText}
                            disabled={isSubmitting}
                        />
                        {confirmationText &&
                            confirmationText !== requiredText && (
                                <p className="text-sm text-destructive">
                                    Confirmation text does not match
                                </p>
                            )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason">
                            Reason for removal{" "}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="reason"
                            name="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Provide a reason for removing this user (minimum 10 characters)"
                            rows={4}
                            disabled={isSubmitting}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Minimum 10 characters required. This reason will be
                            logged in the audit trail.
                        </p>
                        {reason.trim().length > 0 &&
                            reason.trim().length < 10 && (
                                <p className="text-sm text-destructive">
                                    Reason must be at least 10 characters long
                                </p>
                            )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setOpen(false);
                                setConfirmationText("");
                                setReason("");
                            }}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={!canSubmit || isSubmitting}
                        >
                            {isSubmitting ? "Removing..." : "Remove User"}
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

export default function ManageUser() {
    const loaderData = useLoaderData<typeof loader>() as {
        targetUser: any;
        manageableRoles: any[];
        userRoleAssignments: any[];
        mfaStatus: any;
        currentUser: any;
        csrfToken: string;
        canUpdateUsers: boolean;
        canDeleteUser: boolean;
    };
    const {
        targetUser,
        manageableRoles,
        userRoleAssignments,
        mfaStatus,
        currentUser,
        csrfToken,
        canUpdateUsers,
        canDeleteUser,
    } = loaderData;
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();

    const getRoleIcon = (role: string) => {
        switch (role) {
            case "owner":
                return <Crown className="h-5 w-5 text-yellow-600" />;
            case "admin":
                return <Shield className="h-5 w-5 text-blue-600" />;
            default:
                return <User className="h-5 w-5 text-gray-600" />;
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

    const isSubmitting = navigation.state === "submitting";
    const canModify =
        canUpdateUsers &&
        targetUser.id !== currentUser.id &&
        targetUser.role !== "owner";

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0">
            {/* Header */}
            <div className="flex items-start gap-4 flex-col">
                <Link to="/dashboard/account/users">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Users
                    </Button>
                </Link>
                <div>
                    <h3 className="text-2xl font-medium">Manage User</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage user settings, roles, and security
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
                    {/* User Information Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                <User className="h-5 w-5" />
                                User Information
                            </h4>
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    {getRoleIcon(targetUser.role)}
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {targetUser.email}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {targetUser.role}
                                        </div>
                                    </div>
                                    {getRoleBadge(targetUser.role)}
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">
                                            Email:
                                        </span>
                                        <span className="font-medium">
                                            {targetUser.email}
                                        </span>
                                    </div>
                                    {targetUser.createdAt && (
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">
                                                Joined:
                                            </span>
                                            <span className="font-medium">
                                                {new Date(
                                                    targetUser.createdAt
                                                ).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Multi-Factor Authentication Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Multi-Factor Authentication
                            </h4>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Status</p>
                                        <p className="text-sm text-muted-foreground">
                                            {mfaStatus?.enrolled
                                                ? "MFA is enabled"
                                                : "MFA is not enabled"}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            mfaStatus?.enrolled
                                                ? "default"
                                                : "secondary"
                                        }
                                        className="flex items-center gap-1"
                                    >
                                        {mfaStatus?.enrolled ? (
                                            <>
                                                <ShieldCheck className="w-3 h-3" />
                                                Enabled
                                            </>
                                        ) : (
                                            <>
                                                <ShieldOff className="w-3 h-3" />
                                                Disabled
                                            </>
                                        )}
                                    </Badge>
                                </div>

                                {mfaStatus?.required && (
                                    <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
                                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                                            MFA Required
                                        </p>
                                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                            {mfaStatus.requiredReason ===
                                            "role_owner"
                                                ? "MFA is required for account owners."
                                                : mfaStatus.requiredReason ===
                                                    "account_policy"
                                                  ? "MFA is required by account policy."
                                                  : "MFA is required for this account."}
                                        </p>
                                    </div>
                                )}

                                {mfaStatus?.enrolled && (
                                    <div className="space-y-2 text-sm">
                                        {mfaStatus.enrolledAt && (
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                    Enrolled:
                                                </span>
                                                <span className="font-medium">
                                                    {new Date(
                                                        mfaStatus.enrolledAt
                                                    ).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                        {mfaStatus.method && (
                                            <div className="flex items-center gap-2">
                                                <Key className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                    Method:
                                                </span>
                                                <span className="font-medium">
                                                    {mfaStatus.method.toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                        {mfaStatus.lastMfaAt && (
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                    Last verified:
                                                </span>
                                                <span className="font-medium">
                                                    {new Date(
                                                        mfaStatus.lastMfaAt
                                                    ).toLocaleString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* <Separator />    */}
                    <div className="my-12 w-full" />

                    {/* Role Assignment Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Role Assignment
                            </h4>
                            {canUpdateUsers ? (
                                <>
                                    <Form method="post" className="space-y-4">
                                        <input
                                            type="hidden"
                                            name="csrf_token"
                                            value={csrfToken}
                                        />
                                        <input
                                            type="hidden"
                                            name="intent"
                                            value="assign-role"
                                        />
                                        <input
                                            type="hidden"
                                            name="userId"
                                            value={targetUser.id}
                                        />

                                        <div className="space-y-2">
                                            <Label htmlFor="roleId">
                                                Assign Role
                                            </Label>
                                            <Select
                                                name="roleId"
                                                defaultValue=""
                                                disabled={!canModify}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Choose a role" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {manageableRoles.map(
                                                        (role) => (
                                                            <SelectItem
                                                                key={role.id}
                                                                value={role.id}
                                                            >
                                                                {role.name} -{" "}
                                                                {
                                                                    role.description
                                                                }
                                                            </SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            {!canModify && (
                                                <p className="text-sm text-muted-foreground">
                                                    {targetUser.role === "owner"
                                                        ? "Owner users cannot have their roles modified."
                                                        : "You cannot modify your own role."}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="submit"
                                                disabled={
                                                    isSubmitting || !canModify
                                                }
                                            >
                                                {isSubmitting
                                                    ? "Assigning..."
                                                    : "Assign Role"}
                                            </Button>
                                        </div>
                                    </Form>

                                    {/* Current Role Assignments */}
                                    {userRoleAssignments.length > 0 && (
                                        <div className="mt-6 space-y-2">
                                            <Label>
                                                Current Role Assignments
                                            </Label>
                                            <div className="flex flex-wrap gap-2">
                                                {userRoleAssignments.map(
                                                    (assignment) => (
                                                        <Badge
                                                            key={
                                                                assignment.roleId
                                                            }
                                                            variant="outline"
                                                        >
                                                            {assignment.roleName}
                                                        </Badge>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-2">
                                    <Label>Current Role Assignments</Label>
                                    {userRoleAssignments.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {userRoleAssignments.map(
                                                (assignment) => (
                                                    <Badge
                                                        key={assignment.roleId}
                                                        variant="outline"
                                                    >
                                                        {assignment.roleName}
                                                    </Badge>
                                                )
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            No custom roles assigned
                                        </p>
                                    )}
                                    <p className="text-sm text-muted-foreground mt-2">
                                        You have view-only access. You need
                                        update permission to modify role
                                        assignments.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Danger Zone Section */}
                    {canModify && canDeleteUser && (
                        <>
                            {/* <Separator /> */}
                            <div className="my-12 w-full" />
                            <div className="space-y-4">
                                <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-6">
                                    <h4 className="text-md font-semibold text-destructive mb-4">
                                        Danger Zone
                                    </h4>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="font-medium mb-2">
                                                Remove User
                                            </p>
                                            <p className="text-sm text-muted-foreground mb-4">
                                                Soft-delete this user from the
                                                account. The user will be
                                                removed but their data will be
                                                retained for audit purposes.
                                            </p>
                                            <RemoveUserDialog
                                                userId={targetUser.id}
                                                userEmail={targetUser.email}
                                                csrfToken={csrfToken}
                                                isSubmitting={isSubmitting}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
