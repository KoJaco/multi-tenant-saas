import {
    Form,
    useLoaderData,
    useActionData,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { users, roleUsers, roles } from "~/lib/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { AlertTriangle, Crown, Users } from "lucide-react";

const transferOwnershipSchema = z.object({
    newOwnerId: z.string().min(1, "Please select a new owner"),
    confirmation: z.literal("TRANSFER OWNERSHIP"),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requireOwner } = await import("~/lib/permissions.server");
    const { appUser } = await requireOwner(request);

    // Get all non-owner users in the account
    const eligibleUsers = await db
        .select({
            id: users.id,
            email: users.email,
            role: users.role,
        })
        .from(users)
        .where(
            and(
                eq(users.accountId, appUser.accountId),
                ne(users.id, appUser.id) // Exclude current user
            )
        );

    return {
        currentUser: appUser,
        eligibleUsers,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requireOwner } = await import("~/lib/permissions.server");
    const { logger } = await import("~/lib/logging.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { isPostgresError } = await import("~/lib/auth/errors.server");
    const { appUser } = await requireOwner(request);
    const formData = await request.formData();

    try {
        const validatedData = transferOwnershipSchema.parse({
            newOwnerId: formData.get("newOwnerId"),
            confirmation: formData.get("confirmation"),
        });

        // Verify the target user exists and belongs to the account
        const [newOwner] = await db
            .select()
            .from(users)
            .where(
                and(
                    eq(users.id, validatedData.newOwnerId),
                    eq(users.accountId, appUser.accountId)
                )
            );

        if (!newOwner) {
            return createActionErrorResponse(
                "Target user not found in this account",
                404
            );
        }

        if (newOwner.id === appUser.id) {
            return createActionErrorResponse(
                "Cannot transfer ownership to yourself",
                400
            );
        }

        // Get the owner and admin roles for this account
        const [ownerRole, adminRole] = await Promise.all([
            db.query.roles.findFirst({
                where: and(
                    eq(roles.accountId, appUser.accountId),
                    eq(roles.name, "Owner")
                ),
            }),
            db.query.roles.findFirst({
                where: and(
                    eq(roles.accountId, appUser.accountId),
                    eq(roles.name, "Admin")
                ),
            }),
        ]);

        if (!ownerRole) {
            return createActionErrorResponse("Owner role not found", 500);
        }
        if (!adminRole) {
            return createActionErrorResponse("Admin role not found", 500);
        }

        // Get current user's MFA status to check if we need to update the reason
        const currentUserMfaStatus = await db.query.users.findFirst({
            where: eq(users.id, appUser.id),
            columns: {
                mfaRequiredReason: true,
            },
        });

        // Use transaction to make ownership transfer atomic
        await db.transaction(async (tx) => {
            // Remove owner role assignment from current user (old owner)
            await tx.delete(roleUsers).where(
                sql`${roleUsers.userId} = ${appUser.id} 
                        AND ${roleUsers.roleId} = ${ownerRole.id}
                        AND EXISTS (
                            SELECT 1 FROM ${users} 
                            WHERE ${users.id} = ${roleUsers.userId} 
                            AND ${users.accountId} = ${appUser.accountId}
                        )`
            );

            // Assign admin role to current user (old owner)
            try {
                await tx.insert(roleUsers).values({
                    userId: appUser.id,
                    roleId: adminRole.id,
                });
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    // Role already assigned - this is fine
                    logger.info("Admin role already assigned to old owner.", {
                        userId: appUser.id,
                        roleId: adminRole.id,
                    });
                } else {
                    throw error;
                }
            }

            // Update the current user's role to admin
            await tx
                .update(users)
                .set({ role: "admin" })
                .where(
                    and(
                        eq(users.id, appUser.id),
                        eq(users.accountId, appUser.accountId)
                    )
                );

            // Update MFA required reason for old owner if it was "role_owner"
            if (currentUserMfaStatus?.mfaRequiredReason === "role_owner") {
                await tx
                    .update(users)
                    .set({
                        mfaRequiredReason: "previous_role_owner",
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, appUser.id));
            }

            // Remove existing role assignments for new owner (with accountId verification for defense-in-depth)
            await tx.delete(roleUsers).where(
                sql`${roleUsers.userId} = ${validatedData.newOwnerId} 
                        AND EXISTS (
                            SELECT 1 FROM ${users} 
                            WHERE ${users.id} = ${roleUsers.userId} 
                            AND ${users.accountId} = ${appUser.accountId}
                        )`
            );

            // Assign the owner role to the new owner
            try {
                await tx.insert(roleUsers).values({
                    userId: validatedData.newOwnerId,
                    roleId: ownerRole.id,
                });
            } catch (error: unknown) {
                if (isPostgresError(error) && error.code === "23505") {
                    // role already assigned to this user... race condition (same as with accept-invitation and users)
                    logger.info("Role already assigned to this user.", {
                        userId: validatedData.newOwnerId,
                        roleId: ownerRole.id,
                    });
                } else {
                    // fallback to wrapping catch
                    throw error;
                }
            }

            // Update the new owner's role
            await tx
                .update(users)
                .set({ role: "owner" })
                .where(
                    and(
                        eq(users.id, validatedData.newOwnerId),
                        eq(users.accountId, appUser.accountId)
                    )
                );

            // Set MFA required for new owner
            await tx
                .update(users)
                .set({
                    mfaRequired: true,
                    mfaRequiredReason: "role_owner",
                    updatedAt: new Date(),
                })
                .where(eq(users.id, validatedData.newOwnerId));
        });

        // Log ownership transfer to audit logs
        try {
            const { auditUserAction } = await import("~/lib/audit/server");
            await auditUserAction(
                appUser,
                "account.ownership_transferred",
                "accounts",
                appUser.accountId,
                {
                    before: {
                        ownerId: appUser.id,
                        ownerEmail: appUser.email,
                    },
                    after: {
                        ownerId: validatedData.newOwnerId,
                        ownerEmail: newOwner.email,
                    },
                },
                {
                    oldOwnerEmail: appUser.email,
                    newOwnerEmail: newOwner.email,
                    oldOwnerBecameAdmin: true,
                }
            );
        } catch (auditError) {
            // Log audit error but don't fail the operation
            logger.error("Failed to create audit log for ownership transfer", {
                error: auditError,
                accountId: appUser.accountId,
            });
        }

        // Notify new owner
        try {
            const { createNotification } = await import(
                "~/lib/notifications/server"
            );
            await createNotification({
                accountId: appUser.accountId,
                userId: validatedData.newOwnerId,
                type: "critical",
                title: "Account Ownership Transferred",
                message: `You are now the owner of this account. ${appUser.email} has transferred ownership to you.`,
                actionUrl: "/dashboard/account/settings",
                actionLabel: "View Settings",
            });
        } catch (notificationError) {
            logger.error("Failed to send ownership transfer notification to new owner", {
                error: notificationError,
                newOwnerId: validatedData.newOwnerId,
            });
        }

        // Notify old owner
        try {
            const { createNotification } = await import(
                "~/lib/notifications/server"
            );
            await createNotification({
                accountId: appUser.accountId,
                userId: appUser.id,
                type: "warning",
                title: "Ownership Transferred",
                message: `You have transferred account ownership to ${newOwner.email}. Your role has been changed to admin.`,
                actionUrl: "/dashboard/account/settings",
            });
        } catch (notificationError) {
            logger.error("Failed to send ownership transfer notification to old owner", {
                error: notificationError,
                oldOwnerId: appUser.id,
            });
        }

        // Notify all admins/owners about the change
        try {
            const { notifyAccountOwners } = await import(
                "~/lib/notifications/helpers.server"
            );
            await notifyAccountOwners(appUser.accountId, {
                type: "critical",
                title: "Account Ownership Changed",
                message: `Account ownership has been transferred from ${appUser.email} to ${newOwner.email}.`,
                actionUrl: "/dashboard/account/users",
            });
        } catch (notificationError) {
            logger.error("Failed to send ownership transfer notification to admins", {
                error: notificationError,
                accountId: appUser.accountId,
            });
        }

        return { success: true };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An error occurred";
        return createActionErrorResponse(message, 500);
    }
}

export default function AccountOwnership() {
    const { currentUser, eligibleUsers } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    if (actionData?.success) {
        return (
            <div className="space-y-6 w-full mt-12 md:mt-0">
                <div>
                    <h3 className="text-2xl font-medium">Ownership Transfer</h3>
                    <p className="text-sm text-muted-foreground">
                        Transfer account ownership to another user
                    </p>
                </div>

                <Alert>
                    <Crown className="h-4 w-4" />
                    <AlertDescription>
                        <strong>Ownership Transferred Successfully!</strong>
                        <br />
                        <em>You are now an administrator on this account.</em>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Ownership Transfer</h3>
                <p className="text-sm text-muted-foreground">
                    Transfer account ownership to another user. This action is
                    irreversible.
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Current Owner Info Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                <Crown className="h-5 w-5 text-yellow-500" />
                                Current Owner
                            </h4>
                            <div className="space-y-2">
                                <div>
                                    <Label className="text-sm text-muted-foreground">
                                        Email
                                    </Label>
                                    <p className="font-medium">
                                        {currentUser.email}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground">
                                        Role
                                    </Label>
                                    <p className="font-medium">Owner</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Eligible Users Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Eligible Users
                            </h4>
                            <div className="text-sm text-muted-foreground">
                                {eligibleUsers.length === 0
                                    ? "No other users in this account"
                                    : `${eligibleUsers.length} user(s) available for ownership transfer`}
                            </div>
                        </div>
                    </div>

                    {eligibleUsers.length > 0 && (
                        <>
                            {/* <Separator /> */}
                            <div className="my-12 w-full" />
                            {/* Transfer Ownership Section */}
                            <div className="space-y-4">
                                <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-6">
                                    <h4 className="text-md font-semibold text-destructive mb-4">
                                        Transfer Ownership
                                    </h4>
                                    <Alert className="mb-4">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>Warning:</strong> This
                                            action is irreversible. You will
                                            lose owner privileges and become an
                                            administrator.
                                        </AlertDescription>
                                    </Alert>
                                    <Form method="post" className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="newOwnerId">
                                                New Owner
                                            </Label>
                                            <Select name="newOwnerId" required>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select new owner" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {eligibleUsers.map(
                                                        (user) => (
                                                            <SelectItem
                                                                key={user.id}
                                                                value={user.id}
                                                            >
                                                                {user.email} (
                                                                {user.role})
                                                            </SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="confirmation">
                                                Type "TRANSFER OWNERSHIP" to
                                                confirm
                                            </Label>
                                            <Input
                                                id="confirmation"
                                                name="confirmation"
                                                placeholder="TRANSFER OWNERSHIP"
                                                required
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            variant="destructive"
                                            disabled={isSubmitting}
                                            className="w-full"
                                        >
                                            {isSubmitting
                                                ? "Transferring..."
                                                : "Transfer Ownership"}
                                        </Button>
                                    </Form>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
