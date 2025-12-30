// @ts-ignore - Server-only module
import { getSession, commitSession } from "~/lib/cookies.server";
import { redirect } from "react-router";
import { db } from "~/lib/db/index.server";
// TODO: introspect db to sync, grab users from there.
import { users } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { isNotDeleted } from "~/lib/db/soft-delete.server";
import type { AppUser } from "~/lib/db/types";

// Re-export AppUser type for convenience
export type { AppUser };

/**
 * Gets the authenticated user from Supabase and our application user from the database
 * @param request The request object
 * @param redirectTo The path to redirect to if unauthorized (default: "/login")
 * @returns The authenticated user, application user, and headers with session cookie
 */
export async function requireUser(
    request: Request,
    redirectTo: string = "/login"
) {
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { logError } = await import("~/lib/logging.server");
    const url = new URL(request.url);

    // Prevent redirect loops by checking if we're already on the login page
    if (url.pathname === "/login" || url.pathname === "/signup") {
        // If we're already on auth pages, don't redirect again
        throw new Response("Unauthorized", { status: 401 });
    }

    const { supabase, headers } = await createAuthSupabaseClient(request);

    const {
        data: { user: authUser },
        error,
    } = await supabase.auth.getUser();

    if (error || !authUser) {
        // If the request is a GET request, redirect to login
        if (request.method === "GET") {
            // Add the current URL as a redirect parameter to return after login
            const currentUrl = encodeURIComponent(url.pathname + url.search);
            const loginUrl = redirectTo.includes("?")
                ? `${redirectTo}&redirectTo=${currentUrl}`
                : `${redirectTo}?redirectTo=${currentUrl}`;

            throw redirect(loginUrl, { headers });
        }

        // For non-GET requests, throw a 401 response
        throw new Response("Unauthorized", { status: 401, headers });
    }

    try {
        // Get our application user from the database (excluding soft-deleted users)
        const [appUser] = await db
            .select()
            .from(users)
            .where(and(eq(users.id, authUser.id), isNotDeleted(users)));

        if (!appUser) {
            // User has been soft-deleted - sign them out and redirect to login
            await supabase.auth.signOut();

            // If the request is a GET request, redirect to login
            if (request.method === "GET") {
                const currentUrl = encodeURIComponent(
                    url.pathname + url.search
                );
                const loginUrl = redirectTo.includes("?")
                    ? `${redirectTo}?redirectTo=${currentUrl}&message=account_deleted`
                    : `${redirectTo}?message=account_deleted&redirectTo=${currentUrl}`;

                throw redirect(loginUrl, { headers });
            }

            // For non-GET requests, return a 403 response
            throw new Response("Account has been deleted", {
                status: 403,
                headers,
            });
        }

        // Verify all required fields are present
        if (
            !appUser.email ||
            !appUser.provider ||
            !appUser.role ||
            !appUser.accountId
        ) {
            logError(
                new Error("User record missing required fields"),
                "Incomplete user record in requireUser",
                { userId: appUser.id, appUser }
            );
            throw new Response("User record is incomplete", {
                status: 500,
                headers,
            });
        }

        // Check MFA requirements
        // Skip MFA check for auth pages and MFA setup/verify pages
        const authPages = [
            "/login",
            "/signup",
            "/auth/setup-mfa",
            "/auth/verify-mfa",
        ];
        const isAuthPage = authPages.some((page) =>
            url.pathname.startsWith(page)
        );

        if (!isAuthPage && appUser.mfaRequired && !appUser.mfaEnrolled) {
            // User is required to have MFA but hasn't enrolled yet
            // Redirect to MFA setup page
            if (request.method === "GET") {
                throw redirect("/auth/setup-mfa", { headers });
            }
            throw new Response("MFA enrollment required", {
                status: 403,
                headers,
            });
        }

        return { authUser, appUser, headers };
    } catch (error) {
        // If it's already a Response, re-throw it
        if (error instanceof Response) {
            throw error;
        }
        logError(error, "Error in requireUser", { userId: authUser.id });
        throw new Response("Internal server error", { status: 500, headers });
    }
}

/**
 * Gets the Supabase client for the current request
 * @deprecated Use createAuthSupabaseClient from ~/lib/auth/utils.server instead
 * @param request The request object
 * @returns The Supabase client and headers with session cookie
 */
export async function getSupabaseClient(request: Request) {
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    return createAuthSupabaseClient(request);
}

/**
 * Gets the current user if authenticated, but doesn't redirect if not authenticated
 * @param request The request object
 * @returns The authenticated user and headers, or null if not authenticated
 */
export async function getCurrentUser(request: Request) {
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { logError } = await import("~/lib/logging.server");
    const { supabase, headers } = await createAuthSupabaseClient(request);

    const {
        data: { user: authUser },
        error,
    } = await supabase.auth.getUser();

    if (error || !authUser) {
        return { user: null, headers };
    }

    try {
        // Get our application user from the database (excluding soft-deleted users)
        const [appUser] = await db
            .select()
            .from(users)
            .where(and(eq(users.id, authUser.id), isNotDeleted(users)));

        if (!appUser) {
            return { user: null, headers };
        }

        return { user: { authUser, appUser }, headers };
    } catch (error) {
        logError(error, "Error in getCurrentUser", { userId: authUser.id });
        return { user: null, headers };
    }
}
