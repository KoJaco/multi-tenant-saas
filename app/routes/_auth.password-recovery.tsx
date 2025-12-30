import { redirect, type LoaderFunctionArgs } from "react-router";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createAuthSupabaseClient } from "~/lib/auth/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { logger } = await import("~/lib/logging.server");
    const requestUrl = new URL(request.url);
    const token_hash = requestUrl.searchParams.get("token_hash");
    const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
    const next = requestUrl.searchParams.get("next") || "/auth/reset-password";

    logger.debug("Password recovery URL params:", {
        token_hash: token_hash ? "present" : "missing",
        type,
        next,
    });

    if (!token_hash || !type) {
        // Invalid or missing token - redirect to error page
        return redirect(
            "/auth/error?error=invalid_token&message=Invalid or missing recovery token"
        );
    }

    // Only handle recovery type in this route
    if (type !== "recovery") {
        return redirect(
            "/auth/error?error=invalid_token&message=Invalid recovery link type"
        );
    }

    const { supabase, headers } = await createAuthSupabaseClient(request);

    try {
        const { data, error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash,
        });

        logger.debug("Password recovery verification result:", {
            success: !!data.user,
            error: error?.message,
            userId: data.user?.id,
        });

        if (error || !data.user) {
            // Redirect to error page with specific error information
            const errorParams = new URLSearchParams({
                error: "verification_failed",
                message: error?.message || "Password recovery verification failed",
            });
            return redirect(`/auth/error?${errorParams.toString()}`, { headers });
        }

        // Successful verification - redirect to reset password form
        // The user now has a valid session and can set their new password
        return redirect(next, { headers });
    } catch (error) {
        const { logError } = await import("~/lib/logging.server");
        logError(
            error instanceof Error ? error : new Error(String(error)),
            "Password recovery error"
        );
        return redirect("/auth/error?error=server_error&message=Password recovery failed", { headers });
    }
}