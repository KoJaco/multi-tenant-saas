import {
    Form,
    Link,
    redirect,
    useActionData,
    useLoaderData,
    useSearchParams,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Loader2 } from "lucide-react";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "~/components/ui/input-otp";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components/fader";
import { ErrorAlert } from "~/components/ui/error-alert";
import { useState } from "react";

export async function loader(args: LoaderFunctionArgs) {
    const { csrfLoader } = await import("~/lib/auth/csrf-loader.server");
    const { csrfToken, headers } = await csrfLoader(args);
    const requestUrl = new URL(args.request.url);
    const type = requestUrl.searchParams.get("type") || "recovery";
    const email = requestUrl.searchParams.get("email");
    const sent = requestUrl.searchParams.get("sent") === "true";

    return Response.json({ csrfToken, type, email, sent }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
    const { checkRateLimit, rateLimitPresets, createRateLimitError } =
        await import("~/lib/rate-limit.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse, mapAuthError } =
        await import("~/lib/auth/errors.server");
    const { verifyOtpSchema, safeValidateFormData } =
        await import("~/lib/auth/validation.server");

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
        request,
        rateLimitPresets.passwordReset
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
    const validation = safeValidateFormData(verifyOtpSchema, formData);
    if (!validation.success) {
        return createErrorResponse(validation.error, 400, headers);
    }

    const { email, token, type } = validation.data;

    // Verify OTP token
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: type as "recovery" | "email" | "signup" | "magiclink" | "invite",
    });

    if (error || !data.user) {
        return createErrorResponse(
            mapAuthError(error) || "Invalid or expired OTP token",
            400,
            headers
        );
    }

    // For recovery type, check if user is soft-deleted before allowing password reset
    if (type === "recovery") {
        try {
            const { db } = await import("~/lib/db/index.server");
            const { users } = await import("~/lib/db/schema");
            const { eq } = await import("drizzle-orm");

            const existingUser = await db.query.users.findFirst({
                where: eq(users.id, data.user.id),
            });

            if (existingUser && existingUser.deletedAt !== null) {
                // User is soft-deleted - sign them out and prevent password reset
                await supabase.auth.signOut();
                return createErrorResponse(
                    "This account was previously deleted. Please contact support if you would like to restore your account.",
                    403,
                    headers
                );
            }
        } catch (dbError: unknown) {
            const { mapDatabaseError } =
                await import("~/lib/auth/errors.server");
            return createErrorResponse(mapDatabaseError(dbError), 500, headers);
        }

        return redirect("/auth/reset-password", { headers });
    }

    // For other types (email, signup), redirect to dashboard
    return redirect("/dashboard", { headers });
}

export default function VerifyOTP() {
    const actionData = useActionData<typeof action>();
    const loaderData = useLoaderData<typeof loader>() as {
        csrfToken: string;
        type: string;
        email: string | null;
        sent?: boolean;
    };
    const [searchParams] = useSearchParams();
    const navigation = useNavigation();
    const [otpValue, setOtpValue] = useState("");

    const isSubmitting = navigation.state === "submitting";
    const type = loaderData.type || searchParams.get("type") || "recovery";
    const email = loaderData.email || searchParams.get("email") || "";
    const showEmailSent =
        loaderData.sent || searchParams.get("sent") === "true";

    const getTitle = () => {
        switch (type) {
            case "recovery":
                return "Enter verification code";
            case "email":
                return "Verify your email";
            case "signup":
                return "Confirm your signup";
            default:
                return "Enter verification code";
        }
    };

    const getDescription = () => {
        switch (type) {
            case "recovery":
                return "Enter the 6-digit code sent to your email to reset your password.";
            case "email":
                return "Enter the 6-digit code sent to your email to verify your email address.";
            case "signup":
                return "Enter the 6-digit code sent to your email to confirm your signup.";
            default:
                return "Enter the 6-digit code sent to your email.";
        }
    };

    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 left-0 top-1/2 -z-10 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(0%,0rem)] aspect-1313/771 w-128.25 bg-linear-to-tr from-primary to-[#9089fc] opacity-10"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="bg-background/25 shadow-xl border p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px]">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold">{getTitle()}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {getDescription()}
                            </p>
                            {email && (
                                <p className="mt-1 text-sm font-medium">
                                    {email}
                                </p>
                            )}
                        </div>

                        {showEmailSent && (
                            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-700 dark:text-emerald-200 text-center">
                                Check your email for a verification code. Enter
                                it below to continue.
                            </div>
                        )}

                        <Form method="post" className="space-y-6">
                            <input
                                type="hidden"
                                name="csrf_token"
                                value={loaderData.csrfToken}
                            />
                            <input type="hidden" name="email" value={email} />
                            <input type="hidden" name="type" value={type} />
                            <input
                                type="hidden"
                                name="token"
                                value={otpValue}
                            />

                            <div className="flex justify-center">
                                <InputOTP
                                    maxLength={8}
                                    value={otpValue}
                                    onChange={(value) => setOtpValue(value)}
                                    disabled={isSubmitting}
                                >
                                    <InputOTPGroup>
                                        <InputOTPSlot index={0} />
                                        <InputOTPSlot index={1} />
                                        <InputOTPSlot index={2} />
                                        <InputOTPSlot index={3} />
                                        <InputOTPSeparator />
                                        <InputOTPSlot index={4} />
                                        <InputOTPSlot index={5} />
                                        <InputOTPSlot index={6} />
                                        <InputOTPSlot index={7} />
                                    </InputOTPGroup>
                                </InputOTP>
                            </div>

                            {actionData?.error && (
                                <ErrorAlert
                                    title="Verification Error"
                                    message={actionData.error}
                                />
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isSubmitting || otpValue.length !== 8}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    "Verify Code"
                                )}
                            </Button>
                        </Form>

                        <div className="text-center text-sm space-y-2">
                            <div>
                                <span className="text-muted-foreground">
                                    Didn't receive the code?{" "}
                                </span>
                                {type === "recovery" && (
                                    <Link
                                        to="/auth/forgot-password"
                                        className="font-medium text-primary hover:underline"
                                    >
                                        Request a new one
                                    </Link>
                                )}
                            </div>
                            <div>
                                <Link
                                    to="/login"
                                    className="text-primary hover:underline"
                                >
                                    Back to login
                                </Link>
                            </div>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
    );
}
