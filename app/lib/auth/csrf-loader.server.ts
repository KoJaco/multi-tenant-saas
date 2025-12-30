/**
 * Shared CSRF Token Loader Utility
 *
 * Provides a reusable loader function for routes that need CSRF tokens.
 * This reduces duplication across auth routes.
 */

import type { LoaderFunctionArgs } from "react-router";

/**
 * Shared loader function that provides CSRF token for forms
 * Use this in routes that need CSRF protection
 */
export async function csrfLoader({ request }: LoaderFunctionArgs) {
    const { getCsrfTokenWithHeaders } = await import("~/lib/csrf.server");
    const { token, headers } = await getCsrfTokenWithHeaders(request);
    return { csrfToken: token, headers };
}
