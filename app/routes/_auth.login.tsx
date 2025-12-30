import {
    redirect,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
    Form,
    Link,
    useActionData,
    useLoaderData,
    useSearchParams,
    useNavigation,
} from "react-router";
import { Button } from "~/components/ui/button";
import { SocialAuthButtons } from "~/components/social-auth-buttons";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components/fader";
import { ErrorAlert } from "~/components/ui/error-alert";
import { users } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import { csrfLoader } from "~/lib/auth/csrf-loader.server";

export async function loader(args: LoaderFunctionArgs) {
    const { csrfToken, headers } = await csrfLoader(args);
    // Return Response with headers - React Router v7 will parse JSON and use headers
    return Response.json({ csrfToken }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { checkRateLimit, rateLimitPresets, createRateLimitError } =
        await import("~/lib/rate-limit.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse, mapAuthErrorWithAction } =
        await import("~/lib/auth/errors.server");
    const { loginSchema, safeValidateFormData } =
        await import("~/lib/auth/validation.server");
    // Check rate limit
    const rateLimitResult = await checkRateLimit(
        request,
        rateLimitPresets.login
    );
    if (!rateLimitResult.allowed) {
        const { error, status, headers } =
            createRateLimitError(rateLimitResult);
        return createErrorResponse(error, status, headers);
    }

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createErrorResponse(
                "Invalid CSRF token",
                403,
                new Headers()
            );
        }
        throw error;
    }

    const formData = await request.formData();
    const { supabase, headers } = await createAuthSupabaseClient(request);

    // Validate input
    const validation = safeValidateFormData(loginSchema, formData);
    if (!validation.success) {
        return createErrorResponse(validation.error, 400, headers);
    }

    const { email, password, redirectTo } = validation.data;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        const errorWithAction = mapAuthErrorWithAction(error, email);
        return createErrorResponse(errorWithAction.error, 400, headers, {
            ...(errorWithAction.action && { action: errorWithAction.action }),
            ...(errorWithAction.email && { email: errorWithAction.email }),
        });
    }

    if (!data.user || data.user === null) {
        return createErrorResponse(
            "No user found. Please try again.",
            400,
            headers
        );
    }

    // We have received back a valid user from supabase

    try {
        // Check if user exists in our database (excluding soft-deleted users)
        const { isNotDeleted } = await import("~/lib/db/soft-delete.server");
        const existingUser = await db.query.users.findFirst({
            where: and(eq(users.id, data.user.id), isNotDeleted(users)),
        });

        if (!existingUser) {
            // Sign out from Supabase since the account has been deleted
            await supabase.auth.signOut();
            return createErrorResponse(
                "This account has been deleted. Please contact support if you believe this is an error.",
                403,
                headers
            );
        }

        // check email verified status. Here we need to display a 'resend confirmation email' link to redirect to the resend confirmation page.
        if (!existingUser.emailVerified) {
            // Sign out from Supabase since the account has not been verified
            await supabase.auth.signOut();
            return createErrorResponse(
                "Account not verfified. Please check your email for a verification link.",
                403,
                headers,
                {
                    action: {
                        label: "Resend confirmation email",
                        to: `/auth/resend-confirmation?email=${encodeURIComponent(email)}`,
                    },
                    email,
                }
            );
        }

        // Check if MFA is enrolled - if so, redirect to MFA verification
        if (existingUser.mfaEnrolled) {
            // Update last login time (before MFA verification)
            await db
                .update(users)
                .set({
                    lastLoginAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(users.id, data.user.id));

            // Redirect to MFA verification page
            return redirect(
                `/auth/verify-mfa?redirectTo=${encodeURIComponent(redirectTo)}`,
                { headers }
            );
        }

        // Update last login time
        await db
            .update(users)
            .set({
                lastLoginAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, data.user.id));

        return redirect(redirectTo, { headers });
    } catch (dbError: unknown) {
        const { mapDatabaseError } = await import("~/lib/auth/errors.server");
        return createErrorResponse(mapDatabaseError(dbError), 500, headers);
    }
}

export default function Login() {
    const actionData = useActionData<typeof action>();
    // React Router v7 automatically parses JSON responses from loaders
    const loaderData = useLoaderData<typeof loader>() as { csrfToken: string };
    const [searchParams] = useSearchParams();
    const navigation = useNavigation();
    const redirectTo = searchParams.get("redirectTo") || "/dashboard";
    const message = searchParams.get("message");
    const error = searchParams.get("error");

    const isSubmitting = navigation.state === "submitting";

    // Handle invitation hash parameters that ended up on login page
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!window.location.hash) return;

        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const access_token = hashParams.get("access_token");
        const type = hashParams.get("type");
        const refresh_token = hashParams.get("refresh_token");

        // If this is an invitation that ended up on the login page, redirect to accept-invitation
        if (type === "invite" && access_token && refresh_token) {
            const newUrl = `/auth/accept-invitation?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&type=${type}`;
            window.location.replace(newUrl);
            return;
        }
    }, []);

    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(50%,38rem)] md:ml-[max(25%,38rem)] aspect-[1313/771] w-[82.0625rem] bg-gradient-to-tr from-primary to-primary/50 opacity-30"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="bg-background/25 shadow-xl border p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px] border">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold">
                                Sign in to your account
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Enter your email and password to access your
                                account.
                            </p>
                        </div>

                        {message === "password-reset-success" && (
                            <div className="rounded-sm bg-emerald-500/10 border-emerald/25 p-3 text-sm dark:text-emerald-200 text-emerald-700 text-left">
                                Your password has been reset successfully.
                                Please sign in with your new password.
                            </div>
                        )}

                        {error && (
                            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <svg
                                            className="w-4 h-4"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium">
                                            Invitation Error
                                        </p>
                                        <p className="mt-1">
                                            {error === "invalid_invitation" &&
                                                "The invitation link is invalid or has already been used."}
                                            {error === "invitation_expired" &&
                                                "This invitation has expired. Please request a new invitation."}
                                            {error === "missing_token" &&
                                                "Invalid invitation link. Please check the link and try again."}
                                            {error === "database_error" &&
                                                "There was an error processing your invitation. Please try again or contact support."}
                                            {![
                                                "invalid_invitation",
                                                "invitation_expired",
                                                "missing_token",
                                                "database_error",
                                            ].includes(error) &&
                                                "There was an error with your invitation. Please contact support."}
                                        </p>
                                        {(error === "invitation_expired" ||
                                            error === "invalid_invitation") && (
                                            <div className="mt-3 pt-3 border-t border-destructive/20">
                                                <p className="text-sm text-muted-foreground">
                                                    Please contact the person
                                                    who invited you to request a
                                                    new invitation.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-6">
                            <SocialAuthButtons redirectTo={redirectTo} />

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-muted" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="px-2 text-foreground/50">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <Form method="post" className="space-y-4">
                                <input
                                    type="hidden"
                                    name="csrf_token"
                                    value={loaderData.csrfToken}
                                />
                                <input
                                    type="hidden"
                                    name="redirectTo"
                                    value={redirectTo}
                                />

                                <div>
                                    <label
                                        htmlFor="email"
                                        className="block text-sm font-medium"
                                    >
                                        Email address
                                    </label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        disabled={isSubmitting}
                                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="password"
                                        className="block text-sm font-medium"
                                    >
                                        Password
                                    </label>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        disabled={isSubmitting}
                                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <div className="mt-2 text-right">
                                        <Link
                                            to="/auth/forgot-password"
                                            className="text-xs text-primary hover:underline"
                                        >
                                            Forgot password?
                                        </Link>
                                    </div>
                                </div>

                                {actionData?.error && (
                                    <ErrorAlert
                                        title="Login Error"
                                        message={actionData.error}
                                        className="sm:max-w-[440px]"
                                        actions={[
                                            ...(actionData.action
                                                ? [actionData.action]
                                                : []),
                                            ...(!actionData.action &&
                                            (actionData.error.includes(
                                                "Email not confirmed"
                                            ) ||
                                                actionData.error.includes(
                                                    "has not been verified"
                                                ))
                                                ? [
                                                      {
                                                          label: "Resend confirmation email",
                                                          to:
                                                              "/auth/resend-confirmation" +
                                                              ("email" in
                                                                  actionData &&
                                                              actionData.email
                                                                  ? `?email=${encodeURIComponent(actionData.email)}`
                                                                  : ""),
                                                      },
                                                  ]
                                                : []),
                                            ...(actionData.error.includes(
                                                "No account found"
                                            )
                                                ? [
                                                      {
                                                          label: "Create a new account",
                                                          to: "/signup",
                                                      },
                                                  ]
                                                : []),
                                        ]}
                                    />
                                )}

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : (
                                        "Sign in"
                                    )}
                                </Button>
                            </Form>
                        </div>

                        <div className="text-center text-sm">
                            <span className="text-muted-foreground">
                                Don't have an account?{" "}
                            </span>
                            <Link
                                to="/signup"
                                className="font-medium text-primary hover:underline"
                            >
                                Sign up
                            </Link>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
    );
}
