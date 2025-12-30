import {
    Form,
    Link,
    useActionData,
    useLoaderData,
    useSearchParams,
    useNavigation,
    redirect,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";

import { Button } from "~/components/ui/button";
import { Loader2 } from "lucide-react";
import { SocialAuthButtons } from "~/components/social-auth-buttons";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components/fader";
import { ErrorAlert } from "~/components/ui/error-alert";

export async function loader(args: LoaderFunctionArgs) {
    const { csrfLoader } = await import("~/lib/auth/csrf-loader.server");
    const { csrfToken, headers } = await csrfLoader(args);
    // Return Response with headers - React Router v7 will parse JSON and use headers
    return Response.json({ csrfToken }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
    const { checkRateLimit, rateLimitPresets, createRateLimitError } =
        await import("~/lib/rate-limit.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { createAuthSupabaseClient, createAccountWithUser } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse, mapAuthError, mapDatabaseError } =
        await import("~/lib/auth/errors.server");
    const { signupSchema, safeValidateFormData } =
        await import("~/lib/auth/validation.server");
    const { serverConfig } = await import("~/lib/config.server");
    // Get the created user to check role and handle MFA
    const { db } = await import("~/lib/db/index.server");
    const { users } = await import("~/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
        request,
        rateLimitPresets.signup
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
    const validation = safeValidateFormData(signupSchema, formData);
    if (!validation.success) {
        return createErrorResponse(validation.error, 400, headers);
    }

    const { email, password } = validation.data;

    // Check if user exists (including soft-deleted) before creating account
    try {
        const { db } = await import("~/lib/db/index.server");

        // Check for existing user by email (including soft-deleted)
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (existingUser) {
            // Check if user is soft-deleted
            const isUserDeleted = existingUser.deletedAt !== null;

            if (isUserDeleted) {
                // User exists but is soft-deleted
                return createErrorResponse(
                    "This account was previously deleted. Please contact support if you would like to restore your account.",
                    403,
                    headers
                );
            } else {
                // User exists and is active
                return createErrorResponse(
                    "An account with this email already exists. Please sign in instead.",
                    400,
                    headers
                );
            }
        }
    } catch (dbError: unknown) {
        return createErrorResponse(mapDatabaseError(dbError), 500, headers);
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${serverConfig.APP_URL}/auth/confirm?type=signup`,
        },
    });

    if (authError) {
        return createErrorResponse(mapAuthError(authError), 400, headers);
    }

    if (!authData.user) {
        return createErrorResponse(
            "Failed to create user account. Please try again.",
            500,
            headers
        );
    }

    try {
        // Generate account name from email with sanitization
        const emailPrefix = email.split("@")[0];
        const accountName =
            emailPrefix
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 50) || "user";

        const { user: createdUser } = await createAccountWithUser(
            accountName,
            authData.user.id,
            email,
            "email"
        );

        if (createdUser) {
            // If user is owner, require MFA and check enrollment
            if (createdUser.role === "owner") {
                const { setMfaRequired, getMfaStatus } =
                    await import("~/lib/auth/mfa.server");
                // Set MFA as required for owners
                await setMfaRequired(authData.user.id, true, "role_owner");

                // Check if MFA is already enrolled (shouldn't be for new signups)
                const mfaStatus = await getMfaStatus(authData.user.id);
                if (!mfaStatus?.enrolled) {
                    // Redirect to MFA setup (blocking)
                    return redirect("/auth/setup-mfa", { headers });
                }
            } else {
                // For non-owners, create notification recommending MFA
                const { createNotification } =
                    await import("~/lib/notifications/server");
                await createNotification({
                    accountId: createdUser.accountId,
                    userId: createdUser.id,
                    type: "info",
                    title: "Enable Multi-Factor Authentication",
                    message:
                        "We recommend setting up Multi-Factor Authentication (MFA) to secure your account.",
                    actionUrl: "/dashboard/settings/security",
                    actionLabel: "Set up MFA",
                });
            }
        }
    } catch (dbError: unknown) {
        return createErrorResponse(mapDatabaseError(dbError), 500, headers);
    }

    // If email is already confirmed (common in development), redirect to dashboard
    // Otherwise, redirect to signup success page
    if (authData.user.email_confirmed_at) {
        return redirect("/dashboard", { headers });
    }

    return redirect("/auth/signup-success", { headers });
}

export default function SignUp() {
    const actionData = useActionData<typeof action>();
    // React Router v7 automatically parses JSON responses from loaders
    const loaderData = useLoaderData<typeof loader>() as { csrfToken: string };
    const [searchParams] = useSearchParams();
    const navigation = useNavigation();
    const redirectTo = searchParams.get("redirectTo") || "/dashboard";

    const isSubmitting = navigation.state === "submitting";

    return (
        // <MarketingLayout>
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 left-0 top-1/2 -z-10 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(0%,0rem)] aspect-1313/771 w-128.25 bg-linear-to-tr from-primary to-[#9089fc] opacity-10"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="bg-background/25 shadow-xl border p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px]">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold">
                                Create your account
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Start building voice-powered forms today
                            </p>
                        </div>

                        <div className="space-y-6">
                            <SocialAuthButtons redirectTo={redirectTo} />

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-muted" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="px-2 text-muted-foreground">
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
                                        className="mt-1 block w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        autoComplete="new-password"
                                        required
                                        disabled={isSubmitting}
                                        className="mt-1 block w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                </div>

                                {actionData?.error && (
                                    <ErrorAlert
                                        title="Signup Error"
                                        message={actionData.error}
                                        actions={
                                            actionData.error.includes(
                                                "already exists"
                                            )
                                                ? [
                                                      {
                                                          label: "Sign in to your existing account",
                                                          to: "/login",
                                                      },
                                                  ]
                                                : []
                                        }
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
                                            Creating account...
                                        </>
                                    ) : (
                                        "Create account"
                                    )}
                                </Button>
                            </Form>
                        </div>

                        <div className="text-center text-sm">
                            <span className="text-muted-foreground">
                                Already have an account?{" "}
                            </span>
                            <Link
                                to="/login"
                                className="font-medium text-primary hover:underline"
                            >
                                Sign in
                            </Link>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
        // </MarketingLayout>
    );
}
