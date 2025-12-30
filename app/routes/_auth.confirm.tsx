import { redirect, type LoaderFunctionArgs } from "react-router";
import { type EmailOtpType } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { users } from "~/lib/db/schema";

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { logger } = await import("~/lib/logging.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code"); // PKCE flow
    const token_hash = requestUrl.searchParams.get("token_hash"); // OTP flow
    const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
    const next = requestUrl.searchParams.get("next") || "/dashboard";

    const { supabase, headers } = await createAuthSupabaseClient(request);

    let data: { user: any; session: any } | null = null;
    let error: any = null;

    // Handle PKCE flow (code parameter)
    if (code) {
        logger.debug("Email confirmation: PKCE flow detected", { code });
        const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
        data = exchangeResult.data;
        error = exchangeResult.error;
    }
    // Handle OTP flow (token_hash parameter)
    else if (token_hash && type) {
        logger.debug("Email confirmation: OTP flow detected", {
            token_hash,
            type,
        });
        const otpResult = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });
        data = otpResult.data;
        error = otpResult.error;
    }
    // Neither flow detected - invalid request
    else {
        return redirect(
            "/auth/error?error=invalid_token&message=Invalid or missing verification token"
        );
    }

    if (error || !data?.user) {
        // Redirect to error page with specific error information
        const errorParams = new URLSearchParams({
            error: "verification_failed",
            message: error?.message || "Email verification failed",
        });
        return redirect(`/auth/error?${errorParams.toString()}`, { headers });
    }

    try {
        // Update user's email verification status in our database
        await db
            .update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, data.user.id))
            .returning({ id: users.id });
    } catch (dbError) {
        // Log error but continue - Supabase auth succeeded
        const { logError } = await import("~/lib/logging.server");
        logError(dbError, "Database error during email verification", {
            userId: data.user.id,
        });
        // Still redirect since Supabase auth succeeded
    }

    // For email verification, redirect to dashboard (or the specified next URL)
    const redirectUrl = type === "signup" ? "/dashboard" : next;
    return redirect(redirectUrl, { headers });
}
