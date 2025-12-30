/**
 * @deprecated Use createAuthSupabaseClient from ~/lib/auth/utils.server instead
 * This file is kept for backward compatibility
 */
export async function createSupabaseClient(request: Request) {
    const { createAuthSupabaseClient } = await import(
        "~/lib/auth/utils.server"
    );
    return createAuthSupabaseClient(request);
}
