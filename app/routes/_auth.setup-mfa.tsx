import {
    Form,
    redirect,
    useActionData,
    useLoaderData,
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

    logger.debug("MFA setup loader: Starting", {
        url: request.url,
    });

    const { supabase } = await createAuthSupabaseClient(request);

    // Check if user is authenticated
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
        logger.debug(
            "MFA setup loader: No authenticated user, redirecting to login"
        );
        return redirect("/login", { headers });
    }

    logger.debug("MFA setup loader: User authenticated", {
        userId: authUser.id,
        email: authUser.email,
    });

    // Get user from database
    const appUser = await db.query.users.findFirst({
        where: eq(users.id, authUser.id),
    });

    if (!appUser) {
        logger.debug("MFA setup loader: User not found in database", {
            userId: authUser.id,
        });
        return redirect("/login", { headers });
    }

    logger.debug("MFA setup loader: User found in database", {
        userId: authUser.id,
        role: appUser.role,
    });

    // Check if user is owner (required for this blocking flow)
    if (appUser.role !== "owner") {
        logger.debug(
            "MFA setup loader: User is not owner, redirecting to dashboard",
            {
                userId: authUser.id,
                role: appUser.role,
            }
        );
        return redirect("/dashboard", { headers });
    }

    // Check if MFA is already enrolled
    const mfaStatus = await getMfaStatus(authUser.id);
    logger.debug("MFA setup loader: MFA status check", {
        userId: authUser.id,
        enrolled: mfaStatus?.enrolled,
        required: mfaStatus?.required,
        method: mfaStatus?.method,
    });

    if (mfaStatus?.enrolled) {
        logger.debug(
            "MFA setup loader: User already enrolled, redirecting to dashboard",
            {
                userId: authUser.id,
            }
        );
        return redirect("/dashboard", { headers });
    }

    // Check cache for enrollment data first (from action redirect)
    const { getSession } = await import("~/lib/cookies.server");
    const session = await getSession(request);
    const enrollmentToken = session.get("mfa_enrollment_token") as
        | string
        | null;

    let enrollmentFromCache: {
        qrCode?: string;
        secret?: string;
        factorId?: string;
        userId?: string;
    } | null = null;

    if (enrollmentToken) {
        const { getCacheAdapter } = await import("~/lib/adapters/cache");
        const cache = getCacheAdapter();
        enrollmentFromCache = await cache.get(
            `mfa_enrollment:${enrollmentToken}`
        );

        // Clear token from session after reading (one-time use)
        if (enrollmentFromCache) {
            session.unset("mfa_enrollment_token");
            const { commitSession } = await import("~/lib/cookies.server");
            const sessionCookie = await commitSession(session);
            headers.append("Set-Cookie", sessionCookie);

            // Verify it's for this user
            if (enrollmentFromCache.userId !== authUser.id) {
                enrollmentFromCache = null;
            } else {
                // Delete from cache after reading (one-time use)
                await cache.delete(`mfa_enrollment:${enrollmentToken}`);
            }
        }
    }

    // Check URL params for enrollment data (fallback for existing factors)
    const requestUrl = new URL(request.url);
    const qrCode =
        enrollmentFromCache?.qrCode || requestUrl.searchParams.get("qrCode");
    const secret =
        enrollmentFromCache?.secret || requestUrl.searchParams.get("secret");
    const factorId =
        enrollmentFromCache?.factorId ||
        requestUrl.searchParams.get("factorId");
    const isExisting = requestUrl.searchParams.get("existing") === "true";

    logger.debug("MFA setup loader: URL params check", {
        userId: authUser.id,
        hasQrCode: !!qrCode,
        hasSecret: !!secret,
        hasFactorId: !!factorId,
        isExisting,
    });

    // If we have an existing factor but no QR code, get its details
    let factorFriendlyName: string | null = null;
    if ((isExisting || factorId) && !qrCode) {
        logger.debug("MFA setup loader: Checking existing factor status", {
            userId: authUser.id,
            factorId,
        });

        try {
            const { listMfaFactors } = await import("~/lib/auth/mfa.server");
            const existingFactors = await listMfaFactors(supabase);
            // Check both 'all' array and 'totp' array for the factor
            const existingFactor =
                existingFactors.totp?.find((f) => f.id === factorId) ||
                existingFactors.all?.find(
                    (f) => f.id === factorId && f.factor_type === "totp"
                );

            logger.debug("MFA setup loader: Existing factor check result", {
                userId: authUser.id,
                factorId,
                foundFactor: !!existingFactor,
                factorStatus: existingFactor?.status,
                factorFriendlyName: existingFactor?.friendly_name,
            });

            if (existingFactor) {
                factorFriendlyName =
                    existingFactor.friendly_name || "Authenticator App";

                if (existingFactor.status === "verified") {
                    // Factor is already verified, update database and redirect
                    logger.debug(
                        "MFA setup loader: Existing factor already verified",
                        {
                            userId: authUser.id,
                            factorId,
                        }
                    );
                    const { updateMfaEnrollment } =
                        await import("~/lib/auth/mfa.server");
                    await updateMfaEnrollment(authUser.id, true, "totp");
                    return redirect("/dashboard", { headers });
                }
            }
        } catch (error: any) {
            logger.debug("MFA setup loader: Error checking existing factor", {
                userId: authUser.id,
                error: error.message,
            });
        }
    }

    logger.debug("MFA setup loader: Success, returning loader data", {
        userId: authUser.id,
        hasQrCode: !!qrCode,
        hasFactorId: !!factorId,
        isExisting,
        factorFriendlyName,
    });

    // Return Response with headers - React Router v7 will parse JSON and use headers
    return Response.json(
        {
            csrfToken,
            qrCode,
            secret,
            factorId,
            factorFriendlyName,
            error: null,
        },
        { headers }
    );
}

export async function action({ request }: ActionFunctionArgs) {
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse } = await import("~/lib/auth/errors.server");
    const { initiateMfaEnrollment, verifyMfaCode, updateMfaEnrollment } =
        await import("~/lib/auth/mfa.server");
    const { logger } = await import("~/lib/logging.server");

    logger.debug("MFA setup action: Starting", {
        url: request.url,
        method: request.method,
    });

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        logger.debug("MFA setup action: CSRF token validation failed");
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
    const intent = formData.get("intent");

    logger.debug("MFA setup action: Form data received", {
        intent,
    });

    // Get authenticated user
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
        logger.debug("MFA setup action: No authenticated user");
        return createErrorResponse("Not authenticated", 401, headers);
    }

    logger.debug("MFA setup action: User authenticated", {
        userId: authUser.id,
        email: authUser.email,
        intent,
    });

    if (intent === "enroll") {
        // Initiate enrollment
        try {
            logger.debug("MFA setup action: Initiating enrollment", {
                userId: authUser.id,
            });

            // Check if a factor already exists
            const { listMfaFactors } = await import("~/lib/auth/mfa.server");
            const existingFactors = await listMfaFactors(supabase);

            logger.debug("MFA setup action: Existing factors check", {
                userId: authUser.id,
                allFactors: JSON.stringify(existingFactors),
                totpFactors: existingFactors.totp,
                totpCount: existingFactors.totp?.length || 0,
                allCount: existingFactors.all?.length || 0,
            });

            // Check both 'all' array and 'totp' array for TOTP factors
            const existingTotpFactor =
                existingFactors.totp?.find(
                    (f) => f.friendly_name === "Authenticator App"
                ) ||
                existingFactors.all?.find(
                    (f) =>
                        f.factor_type === "totp" &&
                        f.friendly_name === "Authenticator App"
                );

            logger.debug("MFA setup action: Factor search result", {
                userId: authUser.id,
                foundFactor: !!existingTotpFactor,
                factorId: existingTotpFactor?.id,
                factorStatus: existingTotpFactor?.status,
                factorName: existingTotpFactor?.friendly_name,
            });

            let enrollmentData;
            let factorId: string;

            if (existingTotpFactor) {
                // Factor already exists, use it
                logger.debug(
                    "MFA setup action: Existing factor found, using it",
                    {
                        userId: authUser.id,
                        factorId: existingTotpFactor.id,
                    }
                );

                // Get the QR code and secret for the existing factor
                // Note: Supabase doesn't return QR code/secret for existing factors
                // We need to create a new enrollment or handle this differently
                // For now, we'll try to enroll again but with a different approach
                // Actually, if factor exists but isn't verified, we can't get QR code again
                // So we should redirect to verification step directly

                // Check if factor is verified
                if (existingTotpFactor.status === "verified") {
                    // Factor is already verified, update database and redirect
                    logger.debug(
                        "MFA setup action: Factor already verified, updating database",
                        {
                            userId: authUser.id,
                            factorId: existingTotpFactor.id,
                        }
                    );
                    await updateMfaEnrollment(authUser.id, true, "totp");
                    return redirect("/dashboard", { headers });
                } else {
                    // Factor exists but not verified - we can't get QR code again
                    // User needs to verify with the existing factor
                    logger.debug(
                        "MFA setup action: Factor exists but not verified",
                        {
                            userId: authUser.id,
                            factorId: existingTotpFactor.id,
                            status: existingTotpFactor.status,
                        }
                    );

                    // Redirect to verification step with existing factor ID
                    const redirectUrl = new URL("/auth/setup-mfa", request.url);
                    redirectUrl.searchParams.set(
                        "factorId",
                        existingTotpFactor.id
                    );
                    redirectUrl.searchParams.set("existing", "true");

                    return redirect(redirectUrl.toString(), { headers });
                }
            }

            // No existing factor, create new one
            logger.debug(
                "MFA setup action: No existing factor, creating new enrollment",
                {
                    userId: authUser.id,
                }
            );

            enrollmentData = await initiateMfaEnrollment(supabase);
            factorId = enrollmentData.id;

            logger.debug("MFA setup action: Enrollment initiated", {
                userId: authUser.id,
                factorId: enrollmentData.id,
                hasQrCode: !!enrollmentData.totp?.qr_code,
                hasSecret: !!enrollmentData.totp?.secret,
            });

            // Store enrollment data in cache (QR code is too large for cookies)
            // Generate a unique token for this enrollment
            const { nanoid } = await import("nanoid");
            const enrollmentToken = nanoid(32);

            const { getCacheAdapter } = await import("~/lib/adapters/cache");
            const cache = getCacheAdapter();
            await cache.set(
                `mfa_enrollment:${enrollmentToken}`,
                {
                    qrCode: enrollmentData.totp?.qr_code || "",
                    secret: enrollmentData.totp?.secret || "",
                    factorId: enrollmentData.id,
                    userId: authUser.id,
                },
                { ttl: 600 } // 10 minutes expiration
            );

            // Store only the token in session
            const { getSession, commitSession } =
                await import("~/lib/cookies.server");
            const session = await getSession(request);
            session.set("mfa_enrollment_token", enrollmentToken);
            const sessionCookie = await commitSession(session);
            headers.append("Set-Cookie", sessionCookie);

            logger.debug(
                "MFA setup action: Stored enrollment data in cache, redirecting",
                {
                    userId: authUser.id,
                    factorId: enrollmentData.id,
                    enrollmentToken,
                }
            );

            return redirect("/auth/setup-mfa", { headers });
        } catch (error: any) {
            // If error is about existing factor, try to handle it gracefully
            if (
                error.message?.includes("already exists") ||
                error.message?.includes("factor")
            ) {
                logger.debug(
                    "MFA setup action: Factor exists error, checking existing factors",
                    {
                        userId: authUser.id,
                        error: error.message,
                    }
                );

                try {
                    const { listMfaFactors } =
                        await import("~/lib/auth/mfa.server");
                    const existingFactors = await listMfaFactors(supabase);

                    logger.debug(
                        "MFA setup action: Error handler - checking factors",
                        {
                            userId: authUser.id,
                            allFactors: JSON.stringify(existingFactors),
                            totpFactors: existingFactors.totp,
                            totpCount: existingFactors.totp?.length || 0,
                            allCount: existingFactors.all?.length || 0,
                        }
                    );

                    // Check both 'all' array and 'totp' array for TOTP factors
                    const existingTotpFactor =
                        existingFactors.totp?.find(
                            (f) => f.friendly_name === "Authenticator App"
                        ) ||
                        existingFactors.all?.find(
                            (f) =>
                                f.factor_type === "totp" &&
                                f.friendly_name === "Authenticator App"
                        );

                    logger.debug(
                        "MFA setup action: Error handler - factor search",
                        {
                            userId: authUser.id,
                            foundFactor: !!existingTotpFactor,
                            factorId: existingTotpFactor?.id,
                            factorStatus: existingTotpFactor?.status,
                        }
                    );

                    if (existingTotpFactor) {
                        if (existingTotpFactor.status === "verified") {
                            // Already verified, update database
                            await updateMfaEnrollment(
                                authUser.id,
                                true,
                                "totp"
                            );
                            return redirect("/dashboard", { headers });
                        } else {
                            // Not verified, redirect to verification
                            const redirectUrl = new URL(
                                "/auth/setup-mfa",
                                request.url
                            );
                            redirectUrl.searchParams.set(
                                "factorId",
                                existingTotpFactor.id
                            );
                            redirectUrl.searchParams.set("existing", "true");
                            return redirect(redirectUrl.toString(), {
                                headers,
                            });
                        }
                    }
                } catch (checkError: any) {
                    logger.debug(
                        "MFA setup action: Error checking existing factors",
                        {
                            userId: authUser.id,
                            error: checkError.message,
                        }
                    );
                }
            }

            logger.debug("MFA setup action: Enrollment failed", {
                userId: authUser.id,
                error: error.message,
                errorName: error.name,
            });
            return createErrorResponse(
                error.message || "Failed to initiate MFA enrollment",
                400,
                headers
            );
        }
    }

    if (intent === "reset") {
        // Unenroll existing factor and create new enrollment to get QR code
        try {
            logger.debug("MFA setup action: Resetting enrollment", {
                userId: authUser.id,
            });

            // Get the existing factor ID from form or URL params
            const factorIdToReset =
                (formData.get("factorId") as string) ||
                new URL(request.url).searchParams.get("factorId");

            logger.debug("MFA setup action: Factor ID to reset", {
                userId: authUser.id,
                factorIdToReset,
                fromForm: !!formData.get("factorId"),
                fromUrl: !!new URL(request.url).searchParams.get("factorId"),
            });

            if (factorIdToReset) {
                try {
                    // Check if factor exists before trying to unenroll
                    const { listMfaFactors } =
                        await import("~/lib/auth/mfa.server");
                    const existingFactors = await listMfaFactors(supabase);
                    const factorToUnenroll =
                        existingFactors.totp?.find(
                            (f) => f.id === factorIdToReset
                        ) ||
                        existingFactors.all?.find(
                            (f) =>
                                f.id === factorIdToReset &&
                                f.factor_type === "totp"
                        );

                    if (factorToUnenroll) {
                        // Unenroll the existing factor
                        const { unenrollMfaFactor } =
                            await import("~/lib/auth/mfa.server");
                        logger.debug(
                            "MFA setup action: Unenrolling existing factor",
                            {
                                userId: authUser.id,
                                factorId: factorIdToReset,
                            }
                        );
                        await unenrollMfaFactor(supabase, factorIdToReset);
                    } else {
                        logger.debug(
                            "MFA setup action: Factor not found, skipping unenroll",
                            {
                                userId: authUser.id,
                                factorId: factorIdToReset,
                            }
                        );
                    }
                } catch (unenrollError: any) {
                    // If unenroll fails, log but continue - we'll create a new enrollment anyway
                    logger.debug(
                        "MFA setup action: Error unenrolling factor, continuing with new enrollment",
                        {
                            userId: authUser.id,
                            factorId: factorIdToReset,
                            error: unenrollError.message,
                        }
                    );
                }
            } else {
                // No factor ID provided - try to find and unenroll any existing factors
                logger.debug(
                    "MFA setup action: No factor ID provided, checking for existing factors",
                    {
                        userId: authUser.id,
                    }
                );
                try {
                    const { listMfaFactors, unenrollMfaFactor } =
                        await import("~/lib/auth/mfa.server");
                    const existingFactors = await listMfaFactors(supabase);
                    const existingTotpFactor =
                        existingFactors.totp?.find(
                            (f) => f.friendly_name === "Authenticator App"
                        ) ||
                        existingFactors.all?.find(
                            (f) =>
                                f.factor_type === "totp" &&
                                f.friendly_name === "Authenticator App"
                        );

                    if (existingTotpFactor) {
                        logger.debug(
                            "MFA setup action: Found existing factor to unenroll",
                            {
                                userId: authUser.id,
                                factorId: existingTotpFactor.id,
                            }
                        );
                        await unenrollMfaFactor(
                            supabase,
                            existingTotpFactor.id
                        );
                    }
                } catch (unenrollError: any) {
                    logger.debug(
                        "MFA setup action: Error finding/unenrolling factors, continuing",
                        {
                            userId: authUser.id,
                            error: unenrollError.message,
                        }
                    );
                }
            }

            // Create new enrollment
            logger.debug(
                "MFA setup action: Creating new enrollment after reset",
                {
                    userId: authUser.id,
                }
            );
            const enrollmentData = await initiateMfaEnrollment(supabase);

            // Store enrollment data in cache (QR code is too large for cookies)
            // Generate a unique token for this enrollment
            const { nanoid } = await import("nanoid");
            const enrollmentToken = nanoid(32);

            const { getCacheAdapter } = await import("~/lib/adapters/cache");
            const cache = getCacheAdapter();
            await cache.set(
                `mfa_enrollment:${enrollmentToken}`,
                {
                    qrCode: enrollmentData.totp?.qr_code || "",
                    secret: enrollmentData.totp?.secret || "",
                    factorId: enrollmentData.id,
                    userId: authUser.id,
                },
                { ttl: 600 } // 10 minutes expiration
            );

            // Store only the token in session
            const { getSession, commitSession } =
                await import("~/lib/cookies.server");
            const session = await getSession(request);
            session.set("mfa_enrollment_token", enrollmentToken);
            const sessionCookie = await commitSession(session);
            headers.append("Set-Cookie", sessionCookie);

            logger.debug(
                "MFA setup action: Stored enrollment data in cache, redirecting",
                {
                    userId: authUser.id,
                    factorId: enrollmentData.id,
                    enrollmentToken,
                }
            );

            return redirect("/auth/setup-mfa", { headers });
        } catch (error: any) {
            logger.debug("MFA setup action: Reset failed", {
                userId: authUser.id,
                error: error.message,
                errorName: error.name,
            });
            return createErrorResponse(
                error.message || "Failed to reset MFA enrollment",
                400,
                headers
            );
        }
    }

    if (intent === "verify") {
        const code = formData.get("code") as string;

        logger.debug("MFA setup action: Verification intent", {
            userId: authUser.id,
            codeLength: code?.length,
            hasCode: !!code,
        });

        if (!code || code.length !== 6) {
            logger.debug("MFA setup action: Invalid code format", {
                userId: authUser.id,
                codeLength: code?.length,
            });
            return createErrorResponse(
                "Please enter a valid 6-digit code",
                400,
                headers
            );
        }

        try {
            // Get factor ID from form data or URL params
            const factorId =
                (formData.get("factorId") as string) ||
                new URL(request.url).searchParams.get("factorId");

            logger.debug("MFA setup action: Factor ID lookup", {
                userId: authUser.id,
                factorIdFromForm: !!formData.get("factorId"),
                factorIdFromUrl: !!new URL(request.url).searchParams.get(
                    "factorId"
                ),
                factorId,
            });

            if (!factorId) {
                logger.debug("MFA setup action: No factor ID found", {
                    userId: authUser.id,
                });
                return createErrorResponse(
                    "No MFA factor found. Please start over.",
                    400,
                    headers
                );
            }

            // Create challenge for verification
            const { createMfaChallenge } =
                await import("~/lib/auth/mfa.server");

            logger.debug("MFA setup action: Creating challenge", {
                userId: authUser.id,
                factorId,
            });

            const challenge = await createMfaChallenge(supabase, factorId);

            logger.debug("MFA setup action: Challenge created", {
                userId: authUser.id,
                challengeId: challenge.id,
                factorId,
            });

            // Verify the code
            logger.debug("MFA setup action: Verifying code", {
                userId: authUser.id,
                challengeId: challenge.id,
                factorId,
            });

            await verifyMfaCode(supabase, code, factorId, challenge.id);

            logger.debug("MFA setup action: Code verified successfully", {
                userId: authUser.id,
                factorId,
            });

            // Update database with enrollment status
            await updateMfaEnrollment(authUser.id, true, "totp");

            logger.debug(
                "MFA setup action: Database updated, redirecting to dashboard",
                {
                    userId: authUser.id,
                }
            );

            // Redirect to dashboard
            return redirect("/dashboard", { headers });
        } catch (error: any) {
            logger.debug("MFA setup action: Verification failed", {
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
    }

    logger.debug("MFA setup action: Invalid intent", {
        userId: authUser.id,
        intent,
    });

    return createErrorResponse("Invalid action", 400, headers);
}

export default function SetupMFA() {
    // React Router v7 automatically parses JSON responses from loaders
    const loaderData = useLoaderData<typeof loader>() as {
        csrfToken: string;
        qrCode: string | null;
        secret: string | null;
        factorId: string | null;
        factorFriendlyName: string | null;
        error: string | null;
    };
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [otpValue, setOtpValue] = useState("");

    const isSubmitting = navigation.state === "submitting";

    const hasQrCode = !!loaderData.qrCode;
    const hasFactorId = !!loaderData.factorId;
    const isExisting = loaderData.factorId && !hasQrCode; // Existing factor without QR code
    const isStartingEnrollment =
        navigation.formData?.get("intent") === "enroll";

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
                                Set Up Multi-Factor Authentication
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                As an account owner, MFA is required to secure
                                your account.
                            </p>
                        </div>

                        {actionData?.error && (
                            <ErrorAlert
                                title="Error"
                                message={actionData.error}
                            />
                        )}

                        {!hasQrCode && !hasFactorId && !isStartingEnrollment ? (
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Click the button below to start setting up
                                    Multi-Factor Authentication.
                                </p>
                                <Form method="post">
                                    <input
                                        type="hidden"
                                        name="csrf_token"
                                        value={loaderData.csrfToken}
                                    />
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="enroll"
                                    />
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Setting up...
                                            </>
                                        ) : (
                                            "Start Setup"
                                        )}
                                    </Button>
                                </Form>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    {hasQrCode && (
                                        <>
                                            <div>
                                                <h3 className="text-sm font-medium mb-2">
                                                    Step 1: Scan QR Code
                                                </h3>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Scan this QR code with your
                                                    authenticator app (Google
                                                    Authenticator, Authy, etc.)
                                                </p>
                                                {loaderData.qrCode && (
                                                    <div className="flex justify-center p-4 bg-background rounded-lg border">
                                                        <img
                                                            src={
                                                                loaderData.qrCode
                                                            }
                                                            alt="MFA QR Code"
                                                            className="w-64 h-64"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <h3 className="text-sm font-medium mb-2">
                                                    Step 2: Manual Entry
                                                    (Optional)
                                                </h3>
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    If you can't scan the QR
                                                    code, enter this code
                                                    manually:
                                                </p>
                                                {loaderData.secret && (
                                                    <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                                                        {loaderData.secret}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {isExisting && (
                                        <div className="space-y-3">
                                            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
                                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                                    Existing Factor Detected
                                                </p>
                                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                    You have an existing{" "}
                                                    <span className="font-semibold">
                                                        {loaderData.factorFriendlyName ||
                                                            "Authenticator App"}
                                                    </span>{" "}
                                                    setup. Enter the 6-digit
                                                    code from your app to
                                                    verify.
                                                </p>
                                            </div>
                                            <div className="rounded-md bg-slate-500/10 border border-slate-500/20 p-3">
                                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Where to find your code:
                                                </p>
                                                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                                                    <li>
                                                        Open your authenticator
                                                        app (Google
                                                        Authenticator, Authy,
                                                        Microsoft Authenticator,
                                                        etc.)
                                                    </li>
                                                    <li>
                                                        Look for an entry named
                                                        "
                                                        {loaderData.factorFriendlyName ||
                                                            "Authenticator App"}
                                                        " or this website
                                                    </li>
                                                    <li>
                                                        The app will show a
                                                        6-digit code that
                                                        changes every 30 seconds
                                                    </li>
                                                    <li>
                                                        Enter the current code
                                                        below to verify
                                                    </li>
                                                </ul>
                                            </div>
                                            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                                                <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                    Don't have access to your
                                                    authenticator app?
                                                </p>
                                                <Form method="post">
                                                    <input
                                                        type="hidden"
                                                        name="csrf_token"
                                                        value={
                                                            loaderData.csrfToken
                                                        }
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="intent"
                                                        value="reset"
                                                    />
                                                    {loaderData.factorId && (
                                                        <input
                                                            type="hidden"
                                                            name="factorId"
                                                            value={
                                                                loaderData.factorId
                                                            }
                                                        />
                                                    )}
                                                    <Button
                                                        type="submit"
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full"
                                                        disabled={isSubmitting}
                                                    >
                                                        {isSubmitting ? (
                                                            <>
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                Resetting...
                                                            </>
                                                        ) : (
                                                            "Reset and Get New QR Code"
                                                        )}
                                                    </Button>
                                                </Form>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <h3 className="text-sm font-medium mb-2">
                                            {hasQrCode
                                                ? "Step 3: Verify Setup"
                                                : "Verify Setup"}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Enter the 6-digit code from your
                                            authenticator app to verify setup:
                                        </p>
                                        <Form
                                            method="post"
                                            className="space-y-4"
                                        >
                                            <input
                                                type="hidden"
                                                name="csrf_token"
                                                value={loaderData.csrfToken}
                                            />
                                            <input
                                                type="hidden"
                                                name="intent"
                                                value="verify"
                                            />
                                            {loaderData.factorId && (
                                                <input
                                                    type="hidden"
                                                    name="factorId"
                                                    value={loaderData.factorId}
                                                />
                                            )}

                                            <div className="flex justify-center">
                                                <InputOTP
                                                    maxLength={6}
                                                    value={otpValue}
                                                    onChange={setOtpValue}
                                                    name="code"
                                                >
                                                    <InputOTPGroup>
                                                        <InputOTPSlot
                                                            index={0}
                                                        />
                                                        <InputOTPSlot
                                                            index={1}
                                                        />
                                                        <InputOTPSlot
                                                            index={2}
                                                        />
                                                    </InputOTPGroup>
                                                    <InputOTPSeparator />
                                                    <InputOTPGroup>
                                                        <InputOTPSlot
                                                            index={3}
                                                        />
                                                        <InputOTPSlot
                                                            index={4}
                                                        />
                                                        <InputOTPSlot
                                                            index={5}
                                                        />
                                                    </InputOTPGroup>
                                                </InputOTP>
                                            </div>

                                            <input
                                                type="hidden"
                                                name="code"
                                                value={otpValue}
                                            />

                                            <Button
                                                type="submit"
                                                className="w-full"
                                                disabled={
                                                    isSubmitting ||
                                                    otpValue.length !== 6
                                                }
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Verifying...
                                                    </>
                                                ) : (
                                                    "Verify and Complete Setup"
                                                )}
                                            </Button>
                                        </Form>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Fader>
                </Container>
            </main>
        </div>
    );
}
