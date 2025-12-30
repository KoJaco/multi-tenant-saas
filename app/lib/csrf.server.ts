/**
 * CSRF Protection Utility
 *
 * Provides CSRF token generation and validation for form submissions
 */

import { randomBytes, createHash } from "crypto";
import { getSession, commitSession } from "~/lib/cookies.server";

const CSRF_TOKEN_KEY = "csrf_token";
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a CSRF token
 */
function generateToken(): string {
    return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Get or create CSRF token for a session
 */
export async function getCsrfToken(request: Request): Promise<string> {
    const session = await getSession(request);
    let token = session.get(CSRF_TOKEN_KEY);

    if (!token) {
        token = generateToken();
        session.set(CSRF_TOKEN_KEY, token);
    }

    return token;
}

/**
 * Validate CSRF token from form submission
 * @param request The incoming request
 * @param formToken The token from the form (optional, will be read from formData if not provided)
 * @returns true if token is valid, false otherwise
 */
export async function validateCsrfToken(
    request: Request,
    formToken?: string
): Promise<boolean> {
    const session = await getSession(request);
    const sessionToken = session.get(CSRF_TOKEN_KEY);

    if (!sessionToken) {
        return false;
    }

    // If formToken not provided, try to get it from formData
    if (!formToken) {
        const formData = await request.clone().formData();
        formToken = (formData.get("csrf_token") as string | null) || undefined;
    }

    if (!formToken) {
        return false;
    }

    // Use constant-time comparison to prevent timing attacks
    return constantTimeEquals(sessionToken, formToken);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}

/**
 * Middleware helper to validate CSRF token and return error if invalid
 * Use this in action functions for state-changing operations
 */
export async function requireCsrfToken(request: Request): Promise<void> {
    const isValid = await validateCsrfToken(request);

    if (!isValid) {
        throw new Response("Invalid CSRF token", {
            status: 403,
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }
}

/**
 * Get CSRF token and commit session (for use in loaders)
 * Returns both the token and headers with updated session
 */
export async function getCsrfTokenWithHeaders(
    request: Request
): Promise<{ token: string; headers: Headers }> {
    const session = await getSession(request);
    // Get or create token in the SAME session object we'll commit
    let token = session.get(CSRF_TOKEN_KEY);
    if (!token) {
        token = generateToken();
        session.set(CSRF_TOKEN_KEY, token);
    }
    const headers = new Headers();
    headers.append("Set-Cookie", await commitSession(session));

    return { token, headers };
}

/**
 * CSRF token input component helper (for use in forms)
 * This is a server-side helper - you'll need to render the token in your form
 */
export function csrfTokenInput(token: string): string {
    return `<input type="hidden" name="csrf_token" value="${token}" />`;
}
