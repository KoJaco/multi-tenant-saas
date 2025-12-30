import { createCookieSessionStorage } from "react-router";

/**
 * Standardized cookie security settings
 * Ensures consistent security across all session cookies
 */
const isProduction = process.env.NODE_ENV === "production";
const cookieSecurity = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secrets: [process.env.SESSION_SECRET || "uh-ohhhh"],
    secure: isProduction,
    // Add maxAge for session expiration (30 days)
    maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
};

// Create a separate storage for Supabase session
export const supabaseSessionStorage = createCookieSessionStorage({
    cookie: {
        name: "sb-session",
        ...cookieSecurity,
    },
});

// Create a storage for our app session (with minimal data)
export const sessionStorage = createCookieSessionStorage({
    cookie: {
        name: "__session",
        ...cookieSecurity,
    },
});

export async function getSession(request: Request) {
    const cookie = request.headers.get("Cookie");
    return sessionStorage.getSession(cookie);
}

export async function getSupabaseSession(request: Request) {
    const cookie = request.headers.get("Cookie");
    return supabaseSessionStorage.getSession(cookie);
}

export async function commitSession(session: any) {
    return sessionStorage.commitSession(session);
}

export async function commitSupabaseSession(session: any) {
    return supabaseSessionStorage.commitSession(session);
}

export async function destroySession(session: any) {
    return sessionStorage.destroySession(session);
}

export async function destroySupabaseSession(session: any) {
    return supabaseSessionStorage.destroySession(session);
}

// PKCE code verifier key in the session
export const PKCE_CODE_VERIFIER_KEY = "pkce_code_verifier";
