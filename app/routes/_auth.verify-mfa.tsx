import {
    Form,
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
import { csrfLoader } from "~/lib/auth/csrf-loader.server";

export async function loader(args: LoaderFunctionArgs) {
    const { csrfToken, headers } = await csrfLoader(args);
    const { request } = args;
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { db } = await import("~/lib/db/index.server");
    const { users } = await import("~/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getMfaStatus } = await import("~/lib/auth/mfa.server");
    const { logger } = await import("~/lib/logging.server");

    logger.debug("MFA verify loader: Starting", {
        url: request.url,
    });

    const { supabase } = await createAuthSupabaseClient(request);

    // Check if user is authenticated (has temporary session from login)
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
        logger.debug(
            "MFA verify loader: No authenticated user, redirecting to login"
        );
        return redirect("/login", { headers });
    }

    logger.debug("MFA verify loader: User authenticated", {
        userId: authUser.id,
        email: authUser.email,
    });

    // Get user from database
    const appUser = await db.query.users.findFirst({
        where: eq(users.id, authUser.id),
    });

    if (!appUser) {
        logger.debug("MFA verify loader: User not found in database", {
            userId: authUser.id,
        });
        return redirect("/login", { headers });
    }

    // Check MFA enrollment status
    const mfaStatus = await getMfaStatus(authUser.id);
    logger.debug("MFA verify loader: MFA status check", {
        userId: authUser.id,
        enrolled: mfaStatus?.enrolled,
        required: mfaStatus?.required,
        method: mfaStatus?.method,
    });

    if (!mfaStatus?.enrolled) {
        // If not enrolled, redirect to login
        logger.debug(
            "MFA verify loader: User not enrolled in MFA, redirecting to login",
            {
                userId: authUser.id,
            }
        );
        return redirect("/login", { headers });
    }

    // Get MFA factors to show enrollment details
    let totpFactor: any = null;
    try {
        const { listMfaFactors } = await import("~/lib/auth/mfa.server");
        const factorsData = await listMfaFactors(supabase);
        totpFactor =
            factorsData.totp?.[0] ||
            factorsData.all?.find(
                (f: any) => f.factor_type === "totp" && f.status === "verified"
            );
        logger.debug("MFA verify loader: Factors retrieved", {
            userId: authUser.id,
            hasTotpFactor: !!totpFactor,
            factorName: totpFactor?.friendly_name,
        });
    } catch (error) {
        logger.debug("MFA verify loader: Error fetching factors", {
            userId: authUser.id,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        // Continue even if factor fetch fails
    }

    const requestUrl = new URL(request.url);
    const redirectTo =
        requestUrl.searchParams.get("redirectTo") || "/dashboard";

    logger.debug("MFA verify loader: Success, returning loader data", {
        userId: authUser.id,
        redirectTo,
        hasFactor: !!totpFactor,
    });

    // Return Response with headers - React Router v7 will parse JSON and use headers
    return Response.json(
        {
            csrfToken,
            redirectTo,
            mfaStatus,
            factorName: totpFactor?.friendly_name || "Authenticator App",
            enrolledAt: mfaStatus?.enrolledAt,
        },
        { headers }
    );
}

export async function action({ request }: ActionFunctionArgs) {
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse } = await import("~/lib/auth/errors.server");
    const { updateLastMfaAt } = await import("~/lib/auth/mfa.server");
    const { logger } = await import("~/lib/logging.server");

    logger.debug("MFA verify action: Starting", {
        url: request.url,
        method: request.method,
    });

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        logger.debug("MFA verify action: CSRF token validation failed");
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
    const code = formData.get("code") as string;
    const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

    logger.debug("MFA verify action: Form data received", {
        codeLength: code?.length,
        redirectTo,
        hasCode: !!code,
    });

    if (!code || code.length !== 6) {
        logger.debug("MFA verify action: Invalid code format", {
            codeLength: code?.length,
        });
        return createErrorResponse(
            "Please enter a valid 6-digit code",
            400,
            headers
        );
    }

    // Get authenticated user
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
        logger.debug("MFA verify action: No authenticated user");
        return createErrorResponse("Not authenticated", 401, headers);
    }

    logger.debug("MFA verify action: User authenticated", {
        userId: authUser.id,
        email: authUser.email,
    });

    try {
        // Get the TOTP factor
        const factors = await supabase.auth.mfa.listFactors();
        const totpFactor = factors.data?.totp?.[0];

        logger.debug("MFA verify action: Factors retrieved", {
            userId: authUser.id,
            totpFactorsCount: factors.data?.totp?.length || 0,
            hasTotpFactor: !!totpFactor,
            factorId: totpFactor?.id,
        });

        if (!totpFactor) {
            logger.debug("MFA verify action: No TOTP factor found", {
                userId: authUser.id,
            });
            return createErrorResponse(
                "No MFA factor found. Please contact support.",
                400,
                headers
            );
        }

        // Create challenge for verification
        const { createMfaChallenge, verifyMfaCode } =
            await import("~/lib/auth/mfa.server");

        logger.debug("MFA verify action: Creating challenge", {
            userId: authUser.id,
            factorId: totpFactor.id,
        });

        const challenge = await createMfaChallenge(supabase, totpFactor.id);

        logger.debug("MFA verify action: Challenge created", {
            userId: authUser.id,
            challengeId: challenge.id,
            factorId: totpFactor.id,
        });

        // Verify the code
        logger.debug("MFA verify action: Verifying code", {
            userId: authUser.id,
            challengeId: challenge.id,
            factorId: totpFactor.id,
        });

        const verifyResult = await verifyMfaCode(
            supabase,
            code,
            totpFactor.id,
            challenge.id
        );

        logger.debug("MFA verify action: Code verification result", {
            userId: authUser.id,
            success: !!verifyResult,
        });

        if (verifyResult) {
            // Update last MFA verification time
            await updateLastMfaAt(authUser.id);

            logger.debug(
                "MFA verify action: Verification successful, redirecting",
                {
                    userId: authUser.id,
                    redirectTo,
                }
            );

            // Redirect to original destination
            return redirect(redirectTo, { headers });
        }
    } catch (error: any) {
        logger.debug("MFA verify action: Error during verification", {
            userId: authUser.id,
            error: error.message,
            errorName: error.name,
        });
        return createErrorResponse(
            error.message || "Invalid verification code",
            400,
            headers
        );
    }

    logger.debug("MFA verify action: Verification failed (no result)", {
        userId: authUser.id,
    });

    return createErrorResponse("Verification failed", 400, headers);
}

export default function VerifyMFA() {
    // React Router v7 automatically parses JSON responses from loaders
    const loaderData = useLoaderData<typeof loader>() as {
        csrfToken: string;
        redirectTo: string;
        mfaStatus: any;
        factorName: string;
        enrolledAt: Date | null;
    };
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [otpValue, setOtpValue] = useState("");

    const isSubmitting = navigation.state === "submitting";

    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(50%,38rem)] md:ml-[max(25%,38rem)] aspect-[1313/771] w-[82.0625rem] bg-gradient-to-tr from-primary to-primary/50 opacity-30"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="bg-background/25 shadow-xl border p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px]">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold">
                                Multi-Factor Authentication
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Enter the 6-digit code from your authenticator
                                app to continue.
                            </p>
                        </div>

                        {/* Enrollment Information */}
                        <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-4 space-y-3">
                            <div>
                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                    Your MFA Device
                                </p>
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                    <span className="font-semibold">
                                        {loaderData.factorName}
                                    </span>
                                    {loaderData.enrolledAt && (
                                        <span className="ml-2">
                                            (Enrolled{" "}
                                            {new Date(
                                                loaderData.enrolledAt
                                            ).toLocaleDateString()}
                                            )
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="border-t border-blue-500/20 pt-3">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
                                    Where to find your code:
                                </p>
                                <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                                    <li>
                                        Open your authenticator app (Google
                                        Authenticator, Authy, Microsoft
                                        Authenticator, etc.)
                                    </li>
                                    <li>
                                        Look for an entry named "
                                        <span className="font-semibold">
                                            {loaderData.factorName}
                                        </span>
                                        " or this website
                                    </li>
                                    <li>
                                        The app will show a 6-digit code that
                                        changes every 30 seconds
                                    </li>
                                    <li>
                                        Enter the current code below to verify
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {actionData?.error && (
                            <ErrorAlert
                                title="Verification Error"
                                message={actionData.error}
                            />
                        )}

                        <Form method="post" className="space-y-4">
                            <input
                                type="hidden"
                                name="csrf_token"
                                value={loaderData.csrfToken}
                            />
                            <input
                                type="hidden"
                                name="redirectTo"
                                value={loaderData.redirectTo}
                            />

                            <div>
                                <p className="text-sm font-medium mb-2 text-center">
                                    Enter Verification Code
                                </p>
                                <div className="flex justify-center">
                                    <InputOTP
                                        maxLength={6}
                                        value={otpValue}
                                        onChange={setOtpValue}
                                        name="code"
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} />
                                            <InputOTPSlot index={1} />
                                            <InputOTPSlot index={2} />
                                        </InputOTPGroup>
                                        <InputOTPSeparator />
                                        <InputOTPGroup>
                                            <InputOTPSlot index={3} />
                                            <InputOTPSlot index={4} />
                                            <InputOTPSlot index={5} />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                            </div>

                            <input type="hidden" name="code" value={otpValue} />

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isSubmitting || otpValue.length !== 6}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    "Verify"
                                )}
                            </Button>
                        </Form>

                        <div className="text-center">
                            <Button variant="link" asChild>
                                <a href="/login">Back to Login</a>
                            </Button>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
    );
}
