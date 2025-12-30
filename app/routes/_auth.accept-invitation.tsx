import { redirect, type LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { type EmailOtpType } from "@supabase/supabase-js";
import { eq, and } from "drizzle-orm";
import {
    users,
    userInvitations,
    roleUsers,
    roles,
    accounts,
} from "~/lib/db/schema";
import { createAuthSupabaseClient } from "~/lib/auth/utils.server";
import { isPostgresError, mapDatabaseError } from "~/lib/auth/errors.server";
import { createActionErrorResponse } from "~/lib/errors.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { logger } = await import("~/lib/logging.server");

    const requestUrl = new URL(request.url);
    // Handle both query params and hash fragments
    const token_hash = requestUrl.searchParams.get("token_hash");
    const access_token = requestUrl.searchParams.get("access_token");
    const type = requestUrl.searchParams.get("type") as EmailOtpType | null;

    // Handle both invitation formats
    if (
        (token_hash && type === "invite") ||
        (access_token && type === "invite")
    ) {
        const { supabase, headers } = await createAuthSupabaseClient(request);

        let data, error;

        if (access_token) {
            // Handle new format with access_token
            const { data: sessionData, error: sessionError } =
                await supabase.auth.setSession({
                    access_token,
                    refresh_token:
                        requestUrl.searchParams.get("refresh_token") || "",
                });
            data = sessionData;
            error = sessionError;
        } else if (token_hash) {
            // Handle old format with token_hash
            const { data: otpData, error: otpError } =
                await supabase.auth.verifyOtp({
                    type: "invite",
                    token_hash,
                });
            data = otpData;
            error = otpError;
        } else {
            return redirect("/login?error=missing_token");
        }

        if (error || !data?.user) {
            return redirect("/login?error=invalid_invitation", { headers });
        }

        try {
            // Validate user email exists
            if (!data.user?.email) {
                return redirect("/login?error=missing_token", { headers });
            }

            // Find the invitation by email
            const invitationRows = await db
                .select({
                    id: userInvitations.id,
                    email: userInvitations.email,
                    roleId: userInvitations.roleId,
                    accountId: userInvitations.accountId,
                    invitedBy: userInvitations.invitedBy,
                    expiresAt: userInvitations.expiresAt,
                    status: userInvitations.status,
                    roleName: roles.name,
                    accountName: accounts.name,
                })
                .from(userInvitations)
                .leftJoin(roles, eq(userInvitations.roleId, roles.id))
                .leftJoin(accounts, eq(userInvitations.accountId, accounts.id))
                .where(
                    and(
                        eq(userInvitations.email, data.user.email),
                        eq(userInvitations.status, "pending")
                    )
                )
                .limit(1);

            // Assuming invitationRows[0] has appropriate roleName and accountName...

            const invitation = invitationRows[0]
                ? {
                      ...invitationRows[0],
                      role: { name: invitationRows[0].roleName },
                      account: { name: invitationRows[0].accountName },
                  }
                : null;

            if (!invitation) {
                return redirect("/login?error=invalid_invitation", {
                    headers,
                });
            }

            // Check if invitation has expired
            const now = new Date();
            const expiresAt = new Date(invitation.expiresAt);
            if (now > expiresAt) {
                return redirect("/login?error=invitation_expired", {
                    headers,
                });
            }

            // Validate user data exists
            if (!data.user?.id || !data.user?.email) {
                return redirect("/login?error=missing_token", { headers });
            }

            // Assigning to consts as TS won't compile (transaction is async)
            const userId = data.user.id;
            const userEmail = data.user.email;

            // Use transaction for user creation/update and role assignment
            await db.transaction(async (tx) => {
                // Check if user already exists in our database
                const existingUser = await tx.query.users.findFirst({
                    where: eq(users.id, userId),
                });

                // Validate role value and provide fallback
                const roleValue = (invitation.role.name?.toLowerCase() ||
                    "user") as "user" | "admin" | "owner";
                const validRoles = ["user", "admin", "owner"];
                const finalRole = validRoles.includes(roleValue)
                    ? roleValue
                    : "user";

                if (existingUser) {
                    // Update existing user with account information
                    await tx
                        .update(users)
                        .set({
                            accountId: invitation.accountId,
                            emailVerified: true,
                            lastLoginAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(users.id, userId));
                } else {
                    // Create new user in our database
                    await tx.insert(users).values({
                        id: userId,
                        email: userEmail,
                        accountId: invitation.accountId,
                        role: finalRole,
                        provider: "email",
                        providerId: userEmail,
                        emailVerified: true,
                        lastLoginAt: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }

                // Assign user to the role (check if not already assigned)
                const existingRoleAssignment =
                    await tx.query.roleUsers.findFirst({
                        where: and(
                            eq(roleUsers.userId, userId),
                            eq(roleUsers.roleId, invitation.roleId)
                        ),
                    });

                if (!existingRoleAssignment) {
                    try {
                        // insert into roleUsers (userId, roleId, assignedBy)
                        await tx.insert(roleUsers).values({
                            userId: userId,
                            roleId: invitation.roleId,
                            assignedBy: invitation.invitedBy,
                        });
                    } catch (error: unknown) {
                        if (isPostgresError(error) && error.code === "23505") {
                            // role already assigned to this user.
                            logger.info("Role already assigned to this user.", {
                                userId,
                                roleId: invitation.roleId,
                                invitedBy: invitation.invitedBy,
                            });
                        } else {
                            throw error;
                        }
                    }
                }

                // Mark invitation as accepted
                await tx
                    .update(userInvitations)
                    .set({
                        status: "accepted",
                        updatedAt: new Date(),
                    })
                    .where(eq(userInvitations.id, invitation.id));
            });

            // Get inviter info for notifications
            const inviter = await db.query.users.findFirst({
                where: eq(users.id, invitation.invitedBy),
                columns: { email: true },
            });

            // Notify inviter of acceptance
            try {
                const { createNotification } = await import(
                    "~/lib/notifications/server"
                );
                await createNotification({
                    accountId: invitation.accountId,
                    userId: invitation.invitedBy,
                    type: "success",
                    title: "Invitation Accepted",
                    message: `${userEmail} has accepted your invitation and joined the account.`,
                    actionUrl: `/dashboard/account/users/${userId}/manage`,
                    actionLabel: "View User",
                });
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to send invitation acceptance notification to inviter", {
                    error: notificationError,
                    inviterId: invitation.invitedBy,
                });
            }

            // Notify admins/owners about new user
            try {
                const { notifyAccountOwners } = await import(
                    "~/lib/notifications/helpers.server"
                );
                await notifyAccountOwners(invitation.accountId, {
                    type: "success",
                    title: "New User Joined",
                    message: `${userEmail} has joined the account.`,
                    actionUrl: `/dashboard/account/users/${userId}/manage`,
                });
            } catch (notificationError) {
                // Log notification error but don't fail the operation
                const { logger } = await import("~/lib/logging.server");
                logger.error("Failed to send invitation acceptance notification to admins", {
                    error: notificationError,
                    accountId: invitation.accountId,
                });
            }

            // Redirect to password setup for new users
            return redirect("/auth/setup-password", { headers });
        } catch (dbError) {
            const errorMessage = mapDatabaseError(dbError);
            return redirect("/login?error=database_error", { headers });
        }
    }

    // If no token_hash or invalid type, redirect to login
    return redirect("/login?error=missing_token");
}

// Handle client-side hash parameters for Supabase invitations
export default function AcceptInvitation() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!window.location.hash) return;

        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        const error = hashParams.get("error");

        // Handle Supabase errors first
        if (error) {
            let errorParam = "invalid_invitation";
            if (error === "access_denied") {
                errorParam = "invitation_expired";
            }
            window.location.replace(`/login?error=${errorParam}`);
            return;
        }

        // Handle successful invitation with tokens
        if (type === "invite" && access_token && refresh_token) {
            const newUrl = `/auth/accept-invitation?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&type=${type}`;
            window.location.replace(newUrl);
            return;
        }

        // If we have hash params but they're not valid for invitation, redirect to error
        if (window.location.hash) {
            window.location.replace("/login?error=invalid_invitation");
        }
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
                <h2 className="text-lg font-medium">
                    Processing invitation...
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                    Please wait while we process your invitation.
                </p>
            </div>
        </div>
    );
}
