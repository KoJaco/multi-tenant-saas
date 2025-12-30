import {
    Form,
    useActionData,
    useLoaderData,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
    redirect,
} from "react-router";

import { accounts, users } from "~/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "~/components/ui/dialog";
import React, { useEffect, useState } from "react";
import { DialogDescription } from "@radix-ui/react-dialog";
import { LoaderCircle } from "lucide-react";
import { toast } from "~/lib/hooks/use-toast";
import { publicConfig } from "~/lib/config.server";
import {
    createServerClient,
    parseCookieHeader,
    serializeCookieHeader,
} from "@supabase/ssr";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

const passwordUpdateSchema = z
    .object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z
            .string()
            .min(6, "Password must be at least 6 characters"),
        confirmPassword: z
            .string()
            .min(6, "Password must be at least 6 characters"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

const passwordAddSchema = z
    .object({
        newPassword: z
            .string()
            .min(6, "Password must be at least 6 characters"),
        confirmPassword: z
            .string()
            .min(6, "Password must be at least 6 characters"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

const deleteUserAccountSchema = z.object({
    confirmation: z.literal("Delete my user account"),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { appUser } = await requireUser(request);
    const { hasPermission } = await import("~/lib/permissions.server");

    // Check if user has permission to delete their own user account
    const canDeleteUser = await hasPermission(appUser.id, "users", "delete");

    return { user: appUser, canDeleteUser };
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { appUser } = await requireUser(request);
    const formData = await request.formData();
    const intent = formData.get("intent");
    const data = Object.fromEntries(formData);
    const headers = new Headers();
    const cookieHeader = request.headers.get("Cookie");

    try {
        if (intent === "update_password") {
            const validatedData = passwordUpdateSchema.parse(data);

            const supabase = createServerClient(
                publicConfig.SUPABASE_URL,
                publicConfig.SUPABASE_PUBLISHABLE_KEY,
                {
                    cookies: {
                        get(name: string) {
                            const cookies = parseCookieHeader(
                                cookieHeader ?? ""
                            );
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
                            const cookieString = serializeCookieHeader(
                                name,
                                "",
                                { ...options, maxAge: 0 }
                            );
                            headers.append("Set-Cookie", cookieString);
                        },
                    },
                }
            );

            // First verify the current password
            const { error: signInError } =
                await supabase.auth.signInWithPassword({
                    email: appUser.email,
                    password: validatedData.currentPassword,
                });

            if (signInError) {
                return {
                    success: false,
                    error: "Current password is incorrect",
                    intent: "update_password",
                };
            }

            // Update the password
            const { error: updateError } = await supabase.auth.updateUser({
                password: validatedData.newPassword,
            });

            if (updateError) {
                return {
                    success: false,
                    error: updateError.message,
                    intent: "update_password",
                };
            }

            return { success: true, intent: "update_password" };
        }

        if (intent === "add_password") {
            const validatedData = passwordAddSchema.parse(data);

            const supabase = createServerClient(
                publicConfig.SUPABASE_URL,
                publicConfig.SUPABASE_PUBLISHABLE_KEY,
                {
                    cookies: {
                        get(name: string) {
                            const cookies = parseCookieHeader(
                                cookieHeader ?? ""
                            );
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
                            const cookieString = serializeCookieHeader(
                                name,
                                "",
                                { ...options, maxAge: 0 }
                            );
                            headers.append("Set-Cookie", cookieString);
                        },
                    },
                }
            );

            // Add the password (no need to verify current password for social auth users)
            const { error: updateError } = await supabase.auth.updateUser({
                password: validatedData.newPassword,
            });

            if (updateError) {
                return {
                    success: false,
                    error: updateError.message,
                    intent: "add_password",
                };
            }

            return { success: true, intent: "add_password" };
        }

        if (intent === "delete_user") {
            try {
                const validatedData = deleteUserAccountSchema.parse(data);

                // Check if user is the last owner
                if (appUser.role === "owner") {
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
                        return {
                            success: false,
                            error: "You are the last owner of this account. To delete your user account, you must first transfer ownership to another user, or delete the entire account from Account Settings.",
                            intent: "delete_user" as const,
                        };
                    }
                }

                // Soft delete only this user
                await db
                    .update(users)
                    .set({
                        deletedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(eq(users.id, appUser.id), isNull(users.deletedAt))
                    );

                // Sign out from Supabase
                const supabase = createServerClient(
                    publicConfig.SUPABASE_URL,
                    publicConfig.SUPABASE_PUBLISHABLE_KEY,
                    {
                        cookies: {
                            get(name: string) {
                                const cookies = parseCookieHeader(
                                    cookieHeader ?? ""
                                );
                                const cookie = cookies.find(
                                    (c) => c.name === name
                                );
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
                                const cookieString = serializeCookieHeader(
                                    name,
                                    "",
                                    { ...options, maxAge: 0 }
                                );
                                headers.append("Set-Cookie", cookieString);
                            },
                        },
                    }
                );

                await supabase.auth.signOut();

                // Redirect to login page
                return redirect("/login", { headers });
            } catch (deleteError) {
                const { mapDatabaseError } =
                    await import("~/lib/auth/errors.server");
                return {
                    ...createActionErrorResponse(
                        mapDatabaseError(deleteError),
                        500
                    ),
                    intent: "delete_user" as const,
                };
            }
        }

        return createActionErrorResponse("Invalid action", 400);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An error occurred";
        return createActionErrorResponse(message, 500);
    }
}

function DeleteUserAccountModal({
    onClose,
    error,
}: {
    onClose: () => void;
    error?: string;
}) {
    const [confirmMessage, setConfirmMessage] = useState("");
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const handleOnInputChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        setConfirmMessage(event.target.value);
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="p-0">
                <DialogHeader className="p-4">
                    <DialogTitle>Delete User Account</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        {" "}
                        This action cannot be undone. This will remove your user
                        account from this account. You will need to go through
                        support to get it back.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 -mt-8">
                    <Form method="post" className="space-y-4">
                        <input
                            type="hidden"
                            name="intent"
                            value="delete_user"
                        />
                        <div className="space-y-2 p-4">
                            <Label htmlFor="confirmation">
                                Please type "Delete my user account" to confirm
                            </Label>
                            <Input
                                id="confirmation"
                                type="text"
                                name="confirmation"
                                placeholder="Delete my user account"
                                value={confirmMessage}
                                onChange={handleOnInputChange}
                                disabled={isSubmitting}
                            />
                            {error && (
                                <div className="text-sm text-destructive mt-2">
                                    {error}
                                </div>
                            )}
                        </div>
                        <DialogFooter className="flex justify-between w-full border-t p-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                className="mr-auto rounded-sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={
                                    confirmMessage !==
                                        "Delete my user account" || isSubmitting
                                }
                                className="rounded-sm"
                            >
                                {isSubmitting
                                    ? "Deleting..."
                                    : "Delete User Account"}
                            </Button>
                        </DialogFooter>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function SettingsPage() {
    const { user, canDeleteUser } = useLoaderData<typeof loader>();
    const data = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    useEffect(() => {
        if (data && Object.keys(data).includes("success")) {
            if (data?.success) {
                if (data?.intent === "update_password") {
                    toast({
                        title: "Success!",
                        description:
                            "Your password has been updated successfully.",
                    });
                }
                if (data?.intent === "add_password") {
                    toast({
                        title: "Success!",
                        description:
                            "Your password has been added successfully. You can now sign in with your email and password.",
                    });
                }
            }
        }
    }, [data]);

    const hasPassword = user.provider === "email";

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your personal settings and preferences.
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Password Settings Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Password Settings
                            </h4>
                            <p className="text-sm text-muted-foreground mb-4">
                                {hasPassword
                                    ? "Manage your password settings and preferences."
                                    : "You signed in with a social provider. Add a password to enable email/password sign-in as well."}
                            </p>
                            {hasPassword ? (
                                <Form
                                    method="post"
                                    className="gap-y-6 flex flex-col"
                                >
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="update_password"
                                    />
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="currentPassword">
                                                Current Password
                                            </Label>
                                            <Input
                                                id="currentPassword"
                                                name="currentPassword"
                                                type="password"
                                                placeholder="Enter your current password"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="newPassword">
                                                New Password
                                            </Label>
                                            <Input
                                                id="newPassword"
                                                name="newPassword"
                                                type="password"
                                                placeholder="Enter your new password"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="confirmPassword">
                                                Confirm New Password
                                            </Label>
                                            <Input
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                type="password"
                                                placeholder="Confirm your new password"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                        {data &&
                                            "error" in data &&
                                            data.intent ===
                                                "update_password" && (
                                                <div className="text-sm text-destructive">
                                                    {data.error}
                                                </div>
                                            )}
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            variant="default"
                                            disabled={isSubmitting}
                                            className="rounded-lg"
                                        >
                                            {isSubmitting &&
                                            navigation.formData?.get(
                                                "intent"
                                            ) === "update_password"
                                                ? "Updating..."
                                                : "Update Password"}
                                            {isSubmitting &&
                                                navigation.formData?.get(
                                                    "intent"
                                                ) === "update_password" && (
                                                    <LoaderCircle className="w-4 h-4 ml-2 animate-spin" />
                                                )}
                                        </Button>
                                    </div>
                                </Form>
                            ) : (
                                <Form
                                    method="post"
                                    className="gap-y-6 flex flex-col"
                                >
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="add_password"
                                    />
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="newPassword">
                                                New Password
                                            </Label>
                                            <Input
                                                id="newPassword"
                                                name="newPassword"
                                                type="password"
                                                placeholder="Enter your new password"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="confirmPassword">
                                                Confirm Password
                                            </Label>
                                            <Input
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                type="password"
                                                placeholder="Confirm your new password"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                        {data &&
                                            "error" in data &&
                                            data.intent === "add_password" && (
                                                <div className="text-sm text-destructive">
                                                    {data.error}
                                                </div>
                                            )}
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            variant="default"
                                            disabled={isSubmitting}
                                            className="rounded-lg"
                                        >
                                            {isSubmitting &&
                                            navigation.formData?.get(
                                                "intent"
                                            ) === "add_password"
                                                ? "Adding..."
                                                : "Add Password"}
                                            {isSubmitting &&
                                                navigation.formData?.get(
                                                    "intent"
                                                ) === "add_password" && (
                                                    <LoaderCircle className="w-4 h-4 ml-2 animate-spin" />
                                                )}
                                        </Button>
                                    </div>
                                </Form>
                            )}
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Danger Zone Section */}
                    {canDeleteUser && (
                        <div className="space-y-4">
                            <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-6">
                                <h4 className="text-md font-semibold text-destructive mb-4">
                                    Danger Zone
                                </h4>
                                <p className="text-sm text-muted-foreground mb-4">
                                    {user.role === "owner"
                                        ? "Delete your user account to remove yourself from this account. If you are the only owner, you must delete the entire account from Account Settings instead."
                                        : "Delete your user account to remove yourself from this account. You will need to go through support to get it back."}
                                </p>
                                <div>
                                    <Button
                                        variant="destructive"
                                        onClick={() => setShowDeleteModal(true)}
                                    >
                                        Delete My User Account
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {showDeleteModal && (
                <DeleteUserAccountModal
                    onClose={() => setShowDeleteModal(false)}
                    error={
                        data &&
                        ("error" in data || "message" in data) &&
                        "intent" in data &&
                        data.intent === "delete_user"
                            ? "error" in data
                                ? data.error
                                : "message" in data
                                  ? data.message
                                  : undefined
                            : undefined
                    }
                />
            )}
        </div>
    );
}
