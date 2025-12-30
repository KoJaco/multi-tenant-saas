import {
    Form,
    useLoaderData,
    useActionData,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { useEffect } from "react";
import { roles, userInvitations, users } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "~/components/ui/dialog";
import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { z } from "zod";
import { randomBytes } from "crypto";
import { SendIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { supabaseAdmin } from "~/lib/supabase.server";
import { serverConfig } from "~/lib/config.server";
import { sendInvitationEmail } from "~/lib/email.server";
import { accounts } from "~/lib/db/schema";
import { ErrorAlert } from "~/components/ui/error-alert";
import { Card, CardContent } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

const invitationSchema = z.object({
    email: z.string().email("Invalid email address"),
    roleId: z.string().min(1, "Role is required"),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission, getManageableRoles } =
        await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(request, "users", "retrieve");

    const invitations = await db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.accountId, appUser.accountId));

    // Get manageable roles (filtered by hierarchy)
    const manageableRoles = await getManageableRoles(appUser.id);

    return {
        appUser,
        invitations,
        roles: manageableRoles,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission, canAssignRole } =
        await import("~/lib/permissions.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { isPostgresError } = await import("~/lib/auth/errors.server");
    const { appUser } = await requirePermission(request, "users", "create");
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "create") {
            const validatedData = invitationSchema.parse({
                email: formData.get("email"),
                roleId: formData.get("roleId"),
            });

            // Verify role belongs to the same account
            const targetRole = await db.query.roles.findFirst({
                where: and(
                    eq(roles.id, validatedData.roleId),
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

            // Check if current user can assign this role
            const canAssign = await canAssignRole(
                appUser.id,
                validatedData.roleId,
                "invitation" // Special case for invitations
            );

            if (!canAssign) {
                return createActionErrorResponse(
                    "Insufficient privileges to assign this role",
                    403
                );
            }

            // Check if user already exists
            const existingUser = await db.query.users.findFirst({
                where: and(
                    eq(users.email, validatedData.email),
                    eq(users.accountId, appUser.accountId)
                ),
            });

            if (existingUser) {
                return createActionErrorResponse(
                    "User already exists in this account",
                    409
                );
            }

            // Check if invitation already exists
            const existingInvitation = await db.query.userInvitations.findFirst(
                {
                    where: and(
                        eq(userInvitations.email, validatedData.email),
                        eq(userInvitations.accountId, appUser.accountId)
                    ),
                }
            );

            if (existingInvitation) {
                return createActionErrorResponse(
                    "Invitation already exists for this email",
                    409
                );
            }

            // Generate invitation token
            const token = randomBytes(32).toString("hex");

            // Get account and inviter info for email
            const account = await db.query.accounts.findFirst({
                where: eq(accounts.id, appUser.accountId),
                columns: { name: true },
            });
            const inviter = await db.query.users.findFirst({
                where: eq(users.id, appUser.id),
                columns: { email: true },
            });

            try {
                // Create invitation record first
                const [newInvitation] = await db
                    .insert(userInvitations)
                    .values({
                        email: validatedData.email,
                        roleId: validatedData.roleId,
                        accountId: appUser.accountId,
                        token,
                        invitedBy: appUser.id,
                        expiresAt: new Date(
                            Date.now() + 7 * 24 * 60 * 60 * 1000
                        ),
                        status: "pending",
                    })
                    .returning();

                // Try to create Supabase invitation (this sends the email automatically)
                // The accept-invitation route expects Supabase invitation tokens
                const { data: supabaseInvite, error: supabaseError } =
                    await supabaseAdmin.auth.admin.inviteUserByEmail(
                        validatedData.email,
                        {
                            redirectTo: `${serverConfig.APP_URL}/auth/accept-invitation`,
                        }
                    );

                // Always send our custom invitation email as well to ensure delivery
                // This provides a fallback if Supabase email fails or is misconfigured
                const invitationUrl = `${serverConfig.APP_URL}/auth/accept-invitation?token=${token}`;
                try {
                    await sendInvitationEmail(
                        validatedData.email,
                        invitationUrl,
                        inviter?.email || "Someone",
                        account?.name
                    );
                } catch (emailError: any) {
                    // Log email error but don't fail the invitation
                    const { logger } = await import("~/lib/logging.server");
                    logger.warn("Failed to send custom invitation email", {
                        error: emailError.message,
                        email: validatedData.email,
                    });
                }

                if (supabaseError) {
                    // If user already exists in Supabase, that's fine - we've sent custom email
                    if (
                        !supabaseError.message.includes("already registered") &&
                        !supabaseError.message.includes("already exists")
                    ) {
                        // Other Supabase errors - log but don't fail since we sent custom email
                        const { logger } = await import("~/lib/logging.server");
                        logger.warn(
                            "Supabase invitation failed, but custom email sent",
                            {
                                error: supabaseError.message,
                                email: validatedData.email,
                            }
                        );
                    }
                }

                // Log invitation creation to audit logs
                try {
                    const { auditUserAction } = await import("~/lib/audit/server");
                    const roleForAudit = await db.query.roles.findFirst({
                        where: eq(roles.id, validatedData.roleId),
                        columns: { name: true },
                    });
                    await auditUserAction(
                        appUser,
                        "invitation.created",
                        "user_invitations",
                        newInvitation.id,
                        undefined,
                        {
                            email: validatedData.email,
                            roleId: validatedData.roleId,
                            roleName: roleForAudit?.name || "Unknown",
                            invitedBy: inviter?.email || appUser.email,
                        }
                    );
                } catch (auditError) {
                    // Log audit error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error("Failed to create audit log for invitation creation", {
                        error: auditError,
                        invitationId: newInvitation.id,
                    });
                }

                // Notify admins/owners about new invitation
                try {
                    const { notifyAccountOwners } = await import(
                        "~/lib/notifications/helpers.server"
                    );
                    const roleForAudit = await db.query.roles.findFirst({
                        where: eq(roles.id, validatedData.roleId),
                        columns: { name: true },
                    });
                    await notifyAccountOwners(appUser.accountId, {
                        type: "info",
                        title: "New User Invitation",
                        message: `A new invitation has been sent to ${validatedData.email} for role "${roleForAudit?.name || "Unknown"}"`,
                        actionUrl: "/dashboard/account/invitations",
                        actionLabel: "View Invitations",
                    });
                } catch (notificationError) {
                    // Log notification error but don't fail the operation
                    const { logger } = await import("~/lib/logging.server");
                    logger.error("Failed to send invitation creation notification", {
                        error: notificationError,
                        invitationId: newInvitation.id,
                    });
                }

                return { success: true, invitation: newInvitation };
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    return createActionErrorResponse(
                        "Invitation already exists for this email",
                        409
                    );
                }
                throw error;
            }
        }

        if (intent === "resend") {
            const invitationId = formData.get("invitationId");
            if (!invitationId) {
                return createActionErrorResponse(
                    "Invitation ID is required",
                    400
                );
            }

            // Verify invitation exists and belongs to the account
            const invitation = await db.query.userInvitations.findFirst({
                where: and(
                    eq(userInvitations.id, invitationId as string),
                    eq(userInvitations.accountId, appUser.accountId)
                ),
            });

            if (!invitation) {
                return createActionErrorResponse(
                    "Invitation not found or access denied",
                    404
                );
            }

            // Check if current user can manage this invitation
            if (invitation.invitedBy !== appUser.id) {
                const { canManageUser } =
                    await import("~/lib/permissions.server");
                // For invitations, we check if the user can manage the inviter
                const canManage = await canManageUser(
                    appUser.id,
                    invitation.invitedBy
                );
                if (!canManage) {
                    return createActionErrorResponse(
                        "Insufficient privileges to manage this invitation",
                        403
                    );
                }
            }

            // Generate new token
            const newToken = randomBytes(32).toString("hex");

            // Get account and inviter info for email
            const account = await db.query.accounts.findFirst({
                where: eq(accounts.id, appUser.accountId),
                columns: { name: true },
            });
            const inviter = await db.query.users.findFirst({
                where: eq(users.id, invitation.invitedBy),
                columns: { email: true },
            });

            await db
                .update(userInvitations)
                .set({
                    token: newToken,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(userInvitations.id, invitationId as string),
                        eq(userInvitations.accountId, appUser.accountId)
                    )
                );

            // Resend Supabase invitation
            const { error: supabaseError } =
                await supabaseAdmin.auth.admin.inviteUserByEmail(
                    invitation.email,
                    {
                        redirectTo: `${serverConfig.APP_URL}/auth/accept-invitation`,
                    }
                );

            // If Supabase invitation fails (e.g., user already exists),
            // send custom invitation email as fallback
            if (supabaseError) {
                const invitationUrl = `${serverConfig.APP_URL}/auth/accept-invitation?token=${newToken}`;
                await sendInvitationEmail(
                    invitation.email,
                    invitationUrl,
                    inviter?.email || "Someone",
                    account?.name
                );
            }

            // Log invitation resend to audit logs
            try {
                const { auditUserAction } = await import("~/lib/audit/server");
                const roleForAudit = await db.query.roles.findFirst({
                    where: eq(roles.id, invitation.roleId),
                    columns: { name: true },
                });
                await auditUserAction(
                    appUser,
                    "invitation.resent",
                    "user_invitations",
                    invitationId as string,
                    undefined,
                    {
                        email: invitation.email,
                        roleId: invitation.roleId,
                        roleName: roleForAudit?.name || "Unknown",
                    }
                );
            } catch (auditError) {
                // Log audit error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to create audit log for invitation resend", {
                    error: auditError,
                    invitationId: invitationId as string,
                });
            }

            return { success: true };
        }

        if (intent === "delete") {
            const invitationId = formData.get("invitationId");
            if (!invitationId) {
                return createActionErrorResponse(
                    "Invitation ID is required",
                    400
                );
            }

            // Verify invitation exists and belongs to the account
            const invitation = await db.query.userInvitations.findFirst({
                where: and(
                    eq(userInvitations.id, invitationId as string),
                    eq(userInvitations.accountId, appUser.accountId)
                ),
            });

            if (!invitation) {
                return createActionErrorResponse(
                    "Invitation not found or access denied",
                    404
                );
            }

            // Check if current user can manage this invitation
            if (invitation.invitedBy !== appUser.id) {
                const { canManageUser } =
                    await import("~/lib/permissions.server");
                // For invitations, we check if the user can manage the inviter
                const canManage = await canManageUser(
                    appUser.id,
                    invitation.invitedBy
                );
                if (!canManage) {
                    return createActionErrorResponse(
                        "Insufficient privileges to manage this invitation",
                        403
                    );
                }
            }

            // Get role name before deletion for audit log
            const roleForAudit = await db.query.roles.findFirst({
                where: eq(roles.id, invitation.roleId),
                columns: { name: true },
            });

            // Include accountId in WHERE clause for defense-in-depth
            await db
                .delete(userInvitations)
                .where(
                    and(
                        eq(userInvitations.id, invitationId as string),
                        eq(userInvitations.accountId, appUser.accountId)
                    )
                );

            // Log invitation deletion to audit logs
            try {
                const { auditUserAction } = await import("~/lib/audit/server");
                await auditUserAction(
                    appUser,
                    "invitation.deleted",
                    "user_invitations",
                    invitationId as string,
                    {
                        before: {
                            email: invitation.email,
                            roleId: invitation.roleId,
                            roleName: roleForAudit?.name || "Unknown",
                            status: invitation.status,
                        },
                        after: null,
                    },
                    {
                        email: invitation.email,
                        roleId: invitation.roleId,
                        roleName: roleForAudit?.name || "Unknown",
                    }
                );
            } catch (auditError) {
                // Log audit error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to create audit log for invitation deletion", {
                    error: auditError,
                    invitationId: invitationId as string,
                });
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

export default function InvitationsManagement() {
    const { appUser, invitations, roles } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Close modal on successful invitation creation
    useEffect(() => {
        if (
            actionData &&
            "success" in actionData &&
            actionData.success &&
            "invitation" in actionData
        ) {
            setIsCreateOpen(false);
        }
    }, [actionData]);

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0 overflow-x-hidden">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-2xl font-medium">Invitations</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage user invitations for your account
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <SendIcon className="h-4 w-4 mr-2" />
                            Send Invitation
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Send User Invitation</DialogTitle>
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
                                "invitation" in actionData && (
                                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3">
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                            Invitation sent successfully!
                                        </p>
                                    </div>
                                )}

                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input name="email" type="email" required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="roleId">Role</Label>
                                <Select name="roleId" required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((role) => (
                                            <SelectItem
                                                key={role.id}
                                                value={role.id}
                                            >
                                                {role.name} - {role.description}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={navigation.state === "submitting"}
                                >
                                    {navigation.state === "submitting"
                                        ? "Sending..."
                                        : "Send Invitation"}
                                </Button>
                            </DialogFooter>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Invitation Permissions Section */}
                    <div className="space-y-4">
                        <div className="bg-accent/50 text-accent-foreground rounded-lg p-6">
                            <h4 className="text-md font-semibold mb-4">
                                Invitation Permissions
                            </h4>
                            <p className="text-sm text-muted-foreground">
                                You can only invite users to roles you have
                                permission to assign. Invitations are subject to
                                the same hierarchy rules as user management.
                            </p>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    <Table className="border rounded-lg">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Invited By</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invitations.map((invitation) => {
                                const role = roles.find(
                                    (r) => r.id === invitation.roleId
                                );

                                return (
                                    <TableRow key={invitation.id}>
                                        <TableCell>
                                            <div className="font-medium">
                                                {invitation.email}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {role?.name || "Unknown Role"}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div
                                                className={cn(
                                                    "text-sm text-muted-foreground capitalize",
                                                    invitation.status ===
                                                        "accepted" &&
                                                        "text-green-500"
                                                )}
                                            >
                                                {invitation.status}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-muted-foreground">
                                                {invitation.invitedBy ===
                                                appUser.id
                                                    ? "You"
                                                    : "Another user"}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                {invitation.status !==
                                                    "accepted" && (
                                                    <>
                                                        <Form method="post">
                                                            <input
                                                                type="hidden"
                                                                name="intent"
                                                                value="resend"
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="invitationId"
                                                                value={
                                                                    invitation.id
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
                                                                Resend
                                                            </Button>
                                                        </Form>
                                                        <Form method="post">
                                                            <input
                                                                type="hidden"
                                                                name="intent"
                                                                value="delete"
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="invitationId"
                                                                value={
                                                                    invitation.id
                                                                }
                                                            />
                                                            <Button
                                                                type="submit"
                                                                variant="destructive"
                                                                size="sm"
                                                                disabled={
                                                                    navigation.state ===
                                                                    "submitting"
                                                                }
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    if (
                                                                        !confirm(
                                                                            "Are you sure you want to delete this invitation?"
                                                                        )
                                                                    ) {
                                                                        e.preventDefault();
                                                                    }
                                                                }}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </Form>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {invitations.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">
                        No invitations found. Send your first invitation to get
                        started.
                    </p>
                </div>
            )}
        </div>
    );
}
