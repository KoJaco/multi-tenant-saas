import { redirect, type ActionFunctionArgs } from "react-router";
import { createAuthSupabaseClient } from "~/lib/auth/utils.server";

export async function action({ request }: ActionFunctionArgs) {
    const { supabase, headers } = await createAuthSupabaseClient(request);

    await supabase.auth.signOut();

    return redirect("/", { headers });
}
