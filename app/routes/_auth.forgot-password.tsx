import {
    Form,
    Link,
    redirect,
    useActionData,
    useLoaderData,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { Button } from "~/components/ui/button";

export async function action({ request }: ActionFunctionArgs) {
    const { checkRateLimit, rateLimitPresets, createRateLimitError } =
        await import("~/lib/rate-limit.server");
    const { serverConfig } = await import("~/lib/config.server");

    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { mapAuthError } = await import("~/lib/auth/errors.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { forgotPasswordSchema, safeValidateFormData } =
        await import("~/lib/auth/validation.server");

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
        request,
        rateLimitPresets.passwordReset
    );
    if (!rateLimitResult.allowed) {
        const { error, status } = createRateLimitError(rateLimitResult);
        return createActionErrorResponse(error, status);
    }

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createActionErrorResponse("Invalid CSRF token", 403);
        }
        throw error;
    }

    const formData = await request.formData();
    const { supabase, headers } = await createAuthSupabaseClient(request);

    // Validate input
    const validation = safeValidateFormData(forgotPasswordSchema, formData);
    if (!validation.success) {
        return createActionErrorResponse(validation.error, 400);
    }

    const { email } = validation.data;

    // Check if user exists and is not soft-deleted before allowing password reset
    try {
        const { db } = await import("~/lib/db/index.server");
        const { users } = await import("~/lib/db/schema");
        const { eq } = await import("drizzle-orm");

        // Check for existing user by email (including soft-deleted)
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        // user doesn't exist in DB, error out appropriately
        if (!existingUser) {
            return createActionErrorResponse(
                "There is no account associated with this email address. Please sign up first.",
                403
            );
        }

        if (existingUser) {
            // Check if user is soft-deleted
            const isUserDeleted = existingUser.deletedAt !== null;

            if (isUserDeleted) {
                // User exists but is soft-deleted - don't allow password reset
                return createActionErrorResponse(
                    "This account was previously deleted. Please contact support if you would like to restore your account.",
                    403
                );
            }
        }
        // If user doesn't exist in our DB, still allow the request (they might exist in Supabase auth but not our DB yet)
    } catch (dbError: unknown) {
        const { mapDatabaseError } = await import("~/lib/auth/errors.server");
        return createActionErrorResponse(mapDatabaseError(dbError), 500);
    }

    // Send OTP token via email for password recovery
    // Note: Supabase will send an email with OTP token (configured in email template)
    // The user will enter the token on the verify-otp page
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${serverConfig.APP_URL}/auth/verify-otp?type=recovery&email=${encodeURIComponent(email)}`,
    });

    if (error) {
        return createActionErrorResponse(mapAuthError(error), 400);
    }

    // Redirect to verify-otp page with email parameter and sent flag
    return redirect(
        `/auth/verify-otp?type=recovery&email=${encodeURIComponent(email)}&sent=true`,
        { headers }
    );
}

export async function loader({ request }: LoaderFunctionArgs) {
    const { getCsrfTokenWithHeaders } = await import("~/lib/csrf.server");

    const { token, headers } = await getCsrfTokenWithHeaders(request);

    return { csrfToken: token, headers };
}

export default function ForgotPassword() {
    const actionData = useActionData<typeof action>();
    const loaderData = useLoaderData<typeof loader>();

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex flex-1 items-center justify-center">
                <div className="bg-background/25 p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px] border">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold">
                            Reset your password
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Enter your email address and we'll send you a
                            verification code to reset your password.
                        </p>
                    </div>

                    <Form method="post" className="space-y-4">
                        <input
                            type="hidden"
                            name="csrf_token"
                            value={loaderData.csrfToken}
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
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>

                        {actionData &&
                            typeof actionData === "object" &&
                            "message" in actionData &&
                            typeof actionData.message === "string" &&
                            actionData.message && (
                                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                                    {actionData.message}
                                </div>
                            )}

                        <Button type="submit" className="w-full">
                            Send verification code
                        </Button>
                    </Form>

                    <div className="text-center text-sm">
                        <Link
                            to="/login"
                            className="text-primary hover:underline"
                        >
                            Back to login
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
