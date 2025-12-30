import { redirect, type LoaderFunctionArgs } from "react-router";
import { createAuthSupabaseClient } from "~/lib/auth/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    const redirectTo = url.searchParams.get("redirectTo") || "/dashboard";
    const origin = url.origin;

    if (!provider || !["google"].includes(provider)) {
        return redirect("/login");
    }

    const { supabase, headers } = await createAuthSupabaseClient(request);

    // The code verifier will be automatically generated and stored by Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as "google",
        options: {
            redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
            queryParams: {
                access_type: "offline",
                prompt: "consent",
            },
        },
    });

    if (error || !data.url) {
        return redirect("/auth/error", { headers });
    }

    return redirect(data.url, { headers });
}
