import {
    Form,
    useActionData,
    useLoaderData,
    useNavigation,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Loader2, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "~/components/ui/input-otp";
import { useState } from "react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { cn } from "~/lib/utils";

export async function loader({ request }: LoaderFunctionArgs) {
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { getMfaStatus, listMfaFactors } =
        await import("~/lib/auth/mfa.server");
    const { getCsrfTokenWithHeaders } = await import("~/lib/csrf.server");

    const { appUser } = await requireUser(request);
    const { supabase } = await createAuthSupabaseClient(request);
    const { token: csrfToken, headers: csrfHeaders } =
        await getCsrfTokenWithHeaders(request);

    // Get MFA status from database
    const mfaStatus = await getMfaStatus(appUser.id);

    // Get MFA factors from Supabase
    let factors: any[] = [];
    let hasUnverifiedFactor = false;
    try {
        const factorsData = await listMfaFactors(supabase);
        // Include both verified and unverified factors
        factors = factorsData.totp || [];
        // Also check 'all' array for any unverified TOTP factors
        if (factorsData.all) {
            const unverifiedTotpFactors = factorsData.all.filter(
                (f: any) =>
                    f.factor_type === "totp" &&
                    f.status !== "verified" &&
                    !factors.some((existing) => existing.id === f.id)
            );
            factors = [...factors, ...unverifiedTotpFactors];
        }
        // Check if there are any unverified factors
        hasUnverifiedFactor = factors.some((f: any) => f.status !== "verified");
    } catch (error) {
        // If error, factors will be empty array
    }

    return Response.json(
        {
            user: appUser,
            mfaStatus,
            factors,
            hasUnverifiedFactor,
            csrfToken,
        },
        { headers: csrfHeaders }
    );
}

export async function action({ request }: ActionFunctionArgs) {
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createActionErrorResponse } = await import("~/lib/errors.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const {
        initiateMfaEnrollment,
        verifyMfaCode,
        updateMfaEnrollment,
        unenrollMfaFactor,
    } = await import("~/lib/auth/mfa.server");

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createActionErrorResponse("Invalid CSRF token", 403);
        }
        throw error;
    }

    const { appUser } = await requireUser(request);
    const { supabase } = await createAuthSupabaseClient(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "enroll") {
            // Check if a factor already exists before enrolling
            const { listMfaFactors } = await import("~/lib/auth/mfa.server");
            const existingFactors = await listMfaFactors(supabase);

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

            if (existingTotpFactor) {
                // Factor already exists
                if (existingTotpFactor.status === "verified") {
                    // Factor is already verified, update database and return success
                    await updateMfaEnrollment(appUser.id, true, "totp");
                    return {
                        success: true,
                        intent: "enroll",
                        message: "MFA is already enabled",
                    };
                } else {
                    // Factor exists but not verified - guide user to verify it
                    return {
                        success: false,
                        intent: "enroll",
                        message:
                            "An unverified MFA device exists. Please verify it using the code from your authenticator app, or reset if you've lost access to your device.",
                    };
                }
            }

            // No existing factor, create new one
            try {
                const enrollmentData = await initiateMfaEnrollment(supabase);
                return {
                    success: true,
                    intent: "enroll",
                    qrCode: enrollmentData.totp?.qr_code,
                    secret: enrollmentData.totp?.secret,
                    factorId: enrollmentData.id,
                };
            } catch (enrollError: any) {
                // If enrollment fails due to existing factor, check again
                if (
                    enrollError.message?.includes("already exists") ||
                    enrollError.message?.includes("factor")
                ) {
                    const existingFactorsRetry = await listMfaFactors(supabase);
                    const existingTotpFactorRetry =
                        existingFactorsRetry.totp?.find(
                            (f) => f.friendly_name === "Authenticator App"
                        ) ||
                        existingFactorsRetry.all?.find(
                            (f) =>
                                f.factor_type === "totp" &&
                                f.friendly_name === "Authenticator App"
                        );

                    if (existingTotpFactorRetry) {
                        if (existingTotpFactorRetry.status === "verified") {
                            await updateMfaEnrollment(appUser.id, true, "totp");
                            return {
                                success: true,
                                intent: "enroll",
                                message: "MFA is already enabled",
                            };
                        } else {
                            return {
                                success: false,
                                intent: "enroll",
                                message:
                                    "An unverified MFA device exists. Please verify it using the code from your authenticator app, or reset if you've lost access to your device.",
                            };
                        }
                    }
                }
                throw enrollError;
            }
        }

        if (intent === "reset") {
            // Unenroll existing factor and create new enrollment
            const factorIdToReset = formData.get("factorId") as string;

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
                        await unenrollMfaFactor(supabase, factorIdToReset);
                    }
                } catch (unenrollError: any) {
                    // If unenroll fails, log but continue - we'll create a new enrollment anyway
                    console.warn("Error unenrolling factor:", unenrollError);
                }
            } else {
                // No factor ID provided - try to find and unenroll any existing factors
                try {
                    const { listMfaFactors } =
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
                        await unenrollMfaFactor(
                            supabase,
                            existingTotpFactor.id
                        );
                    }
                } catch (unenrollError: any) {
                    console.warn(
                        "Error finding/unenrolling factors:",
                        unenrollError
                    );
                }
            }

            // Create new enrollment
            const enrollmentData = await initiateMfaEnrollment(supabase);

            // Update database to reflect reset (unenrolled)
            await updateMfaEnrollment(appUser.id, false, null);

            return {
                success: true,
                intent: "reset",
                qrCode: enrollmentData.totp?.qr_code,
                secret: enrollmentData.totp?.secret,
                factorId: enrollmentData.id,
                message: "MFA reset successfully. Please scan the new QR code.",
            };
        }

        if (intent === "verify") {
            const code = formData.get("code") as string;

            if (!code || code.length !== 6) {
                return createActionErrorResponse(
                    "Please enter a valid 6-digit code",
                    400
                );
            }

            // Get factor ID from form or from factors list
            const factorIdFromForm = formData.get("factorId") as string;
            let factorId = factorIdFromForm;

            if (!factorId) {
                // Fallback to getting from factors list
                const factors = await supabase.auth.mfa.listFactors();
                const totpFactor = factors.data?.totp?.[0];
                if (!totpFactor) {
                    return createActionErrorResponse(
                        "No MFA factor found. Please start over.",
                        400
                    );
                }
                factorId = totpFactor.id;
            }

            // Create challenge for verification
            const { createMfaChallenge } =
                await import("~/lib/auth/mfa.server");
            const challenge = await createMfaChallenge(supabase, factorId);

            // Verify the code
            await verifyMfaCode(supabase, code, factorId, challenge.id);

            // Update database
            await updateMfaEnrollment(appUser.id, true, "totp");

            return {
                success: true,
                intent: "verify",
                message: "MFA has been successfully enabled",
            };
        }

        if (intent === "unenroll") {
            const factorId = formData.get("factorId") as string;

            if (!factorId) {
                return createActionErrorResponse("Factor ID is required", 400);
            }

            // Check if user is owner and MFA is required
            if (appUser.role === "owner") {
                return createActionErrorResponse(
                    "Owners cannot disable MFA. MFA is required for account owners.",
                    403
                );
            }

            // Unenroll the factor
            await unenrollMfaFactor(supabase, factorId);

            // Update database
            await updateMfaEnrollment(appUser.id, false, null);

            return {
                success: true,
                intent: "unenroll",
                message: "MFA has been successfully disabled",
            };
        }

        return createActionErrorResponse("Invalid action", 400);
    } catch (error: any) {
        return createActionErrorResponse(
            error.message || "An error occurred",
            500
        );
    }
}

export default function SecurityPage() {
    // React Router v7 automatically parses JSON responses from loaders
    const loaderData = useLoaderData<typeof loader>() as {
        user: any;
        mfaStatus: any;
        factors: any[];
        hasUnverifiedFactor: boolean;
        csrfToken: string;
    };
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const [otpValue, setOtpValue] = useState("");

    const { user, mfaStatus, factors, hasUnverifiedFactor, csrfToken } =
        loaderData;
    const isSubmitting = navigation.state === "submitting";
    const isEnrolling =
        actionData && "intent" in actionData && actionData.intent === "enroll";
    const isResetting =
        actionData && "intent" in actionData && actionData.intent === "reset";
    const isVerifying = navigation.formData?.get("intent") === "verify";
    const showQrCode = (isEnrolling || isResetting) && actionData?.qrCode;

    return (
        <div className="w-full space-y-6 mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Security</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your account security settings including Multi-Factor
                    Authentication
                </p>
            </div>

            {/* MFA Status Card */}
            <Card>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                Multi-Factor Authentication
                            </h4>
                            {/* Current Status */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Status</p>
                                    <p className="text-sm text-muted-foreground">
                                        {mfaStatus?.enrolled
                                            ? "MFA is enabled on your account"
                                            : "MFA is not enabled"}
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        mfaStatus?.enrolled
                                            ? "default"
                                            : "secondary"
                                    }
                                    className={cn(
                                        "flex items-center gap-1",
                                        mfaStatus?.enrolled
                                            ? "bg-emerald-500/25 border border-emerald-500/20 text-emerald-700 dark:text-emerald-100"
                                            : "bg-yellow-500/25 border border-yellow-500/20 text-yellow-100"
                                    )}
                                >
                                    {mfaStatus?.enrolled ? (
                                        <>
                                            <ShieldCheck className="w-3 h-3" />
                                            Enabled
                                        </>
                                    ) : (
                                        <>
                                            <ShieldOff className="w-3 h-3" />
                                            Disabled
                                        </>
                                    )}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* MFA Requirement Info */}
                    {mfaStatus?.required && (
                        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
                            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                                MFA Required
                            </p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                {mfaStatus.requiredReason === "role_owner"
                                    ? "As an account owner, Multi-Factor Authentication is required to secure your account."
                                    : mfaStatus.requiredReason ===
                                        "account_policy"
                                      ? "Your account administrator has required MFA for all users."
                                      : "Multi-Factor Authentication is required for your account."}
                            </p>
                        </div>
                    )}

                    {/* Enrollment Status */}
                    {mfaStatus?.enrolled && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                Enrollment Details
                            </p>
                            <div className="text-sm text-muted-foreground space-y-1">
                                {mfaStatus.enrolledAt && (
                                    <p>
                                        Enrolled:{" "}
                                        {new Date(
                                            mfaStatus.enrolledAt
                                        ).toLocaleDateString()}
                                    </p>
                                )}
                                {mfaStatus.method && (
                                    <p>
                                        Method: {mfaStatus.method.toUpperCase()}
                                    </p>
                                )}
                                {mfaStatus.lastMfaAt && (
                                    <p>
                                        Last verified:{" "}
                                        {new Date(
                                            mfaStatus.lastMfaAt
                                        ).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Enrolled Factors */}
                    {factors.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                Enrolled Devices
                            </p>
                            <div className="space-y-2">
                                {factors.map((factor) => (
                                    <div
                                        key={factor.id}
                                        className="flex items-center justify-between p-3 bg-background rounded-md"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">
                                                {factor.friendly_name ||
                                                    "Authenticator App"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {factor.factor_type?.toUpperCase()}
                                                {factor.status &&
                                                    factor.status !==
                                                        "verified" && (
                                                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                                                            (Unverified)
                                                        </span>
                                                    )}
                                            </p>
                                        </div>
                                        {user.role !== "owner" &&
                                            factor.status === "verified" && (
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
                                                        value="unenroll"
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="factorId"
                                                        value={factor.id}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        variant="destructive"
                                                        size="sm"
                                                        disabled={isSubmitting}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Form>
                                            )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Messages */}
                    {actionData?.message && (
                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3">
                            <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                {actionData.message}
                            </p>
                        </div>
                    )}

                    {actionData &&
                        "success" in actionData &&
                        !actionData.success &&
                        "message" in actionData && (
                            <div className="space-y-2">
                                <ErrorAlert
                                    title="Error"
                                    message={
                                        actionData.message ||
                                        "An error occurred"
                                    }
                                />
                                {/* Show reset option if error is about existing factor */}
                                {(actionData.message?.includes(
                                    "already exists"
                                ) ||
                                    actionData.message?.includes("factor") ||
                                    actionData.message?.includes(
                                        "unverified"
                                    )) && (
                                    <Form method="post">
                                        <input
                                            type="hidden"
                                            name="csrf_token"
                                            value={csrfToken}
                                        />
                                        <input
                                            type="hidden"
                                            name="intent"
                                            value="reset"
                                        />
                                        {factors.find(
                                            (f: any) => f.status !== "verified"
                                        ) && (
                                            <input
                                                type="hidden"
                                                name="factorId"
                                                value={
                                                    factors.find(
                                                        (f: any) =>
                                                            f.status !==
                                                            "verified"
                                                    )?.id
                                                }
                                            />
                                        )}
                                        <Button
                                            type="submit"
                                            variant="outline"
                                            disabled={isSubmitting}
                                            className="w-full"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Resetting...
                                                </>
                                            ) : (
                                                "Reset MFA Setup"
                                            )}
                                        </Button>
                                    </Form>
                                )}
                            </div>
                        )}

                    {/* Verification Flow for Unverified Factors */}
                    {!mfaStatus?.enrolled &&
                        hasUnverifiedFactor &&
                        !isEnrolling &&
                        !isResetting &&
                        !showQrCode && (
                            <div className="space-y-4">
                                <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
                                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                        Verify Existing MFA Device
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                        You have an unverified MFA device. Enter
                                        the 6-digit code from your authenticator
                                        app to complete setup.
                                    </p>
                                </div>

                                <Form method="post" className="space-y-4">
                                    <input
                                        type="hidden"
                                        name="csrf_token"
                                        value={csrfToken}
                                    />
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="verify"
                                    />
                                    {factors.find(
                                        (f: any) => f.status !== "verified"
                                    ) && (
                                        <input
                                            type="hidden"
                                            name="factorId"
                                            value={
                                                factors.find(
                                                    (f: any) =>
                                                        f.status !== "verified"
                                                )?.id
                                            }
                                        />
                                    )}

                                    <div>
                                        <p className="text-sm font-medium mb-2">
                                            Enter Verification Code
                                        </p>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Enter the 6-digit code from your
                                            authenticator app:
                                        </p>
                                        <div className="flex justify-center mb-4">
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
                                        <input
                                            type="hidden"
                                            name="code"
                                            value={otpValue}
                                        />
                                    </div>

                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={
                                            isSubmitting ||
                                            otpValue.length !== 6
                                        }
                                    >
                                        {isVerifying ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            "Verify and Enable MFA"
                                        )}
                                    </Button>
                                </Form>

                                {/* Reset option */}
                                <Form method="post">
                                    <input
                                        type="hidden"
                                        name="csrf_token"
                                        value={csrfToken}
                                    />
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="reset"
                                    />
                                    {factors.find(
                                        (f: any) => f.status !== "verified"
                                    ) && (
                                        <input
                                            type="hidden"
                                            name="factorId"
                                            value={
                                                factors.find(
                                                    (f: any) =>
                                                        f.status !== "verified"
                                                )?.id
                                            }
                                        />
                                    )}
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        disabled={isSubmitting}
                                        className="w-full"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Resetting...
                                            </>
                                        ) : (
                                            "Reset MFA Setup (Lost Device)"
                                        )}
                                    </Button>
                                </Form>
                            </div>
                        )}

                    {/* Enrollment Flow - Only show if no factors exist */}
                    {!mfaStatus?.enrolled &&
                        !hasUnverifiedFactor &&
                        !isEnrolling &&
                        !isResetting &&
                        !showQrCode && (
                            <div className="space-y-2">
                                <Form method="post">
                                    <input
                                        type="hidden"
                                        name="csrf_token"
                                        value={csrfToken}
                                    />
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="enroll"
                                    />
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Setting up...
                                            </>
                                        ) : (
                                            "Enable MFA"
                                        )}
                                    </Button>
                                </Form>
                            </div>
                        )}

                    {/* QR Code Display */}
                    {showQrCode && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium mb-2">
                                    Step 1: Scan QR Code
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Scan this QR code with your authenticator
                                    app (Google Authenticator, Authy, etc.)
                                </p>
                                <div className="flex justify-center p-4 bg-background rounded-lg border">
                                    <img
                                        src={actionData.qrCode}
                                        alt="MFA QR Code"
                                        className="w-64 h-64"
                                    />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium mb-2">
                                    Step 2: Manual Entry (Optional)
                                </h3>
                                <p className="text-sm text-muted-foreground mb-2">
                                    If you can't scan the QR code, enter this
                                    code manually:
                                </p>
                                {actionData.secret && (
                                    <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                                        {actionData.secret}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-medium mb-2">
                                    Step 3: Verify Setup
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Enter the 6-digit code from your
                                    authenticator app to verify setup:
                                </p>
                                <Form method="post" className="space-y-4">
                                    <input
                                        type="hidden"
                                        name="csrf_token"
                                        value={csrfToken}
                                    />
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="verify"
                                    />
                                    {actionData?.factorId && (
                                        <input
                                            type="hidden"
                                            name="factorId"
                                            value={actionData.factorId}
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
                                        {isVerifying ? (
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
