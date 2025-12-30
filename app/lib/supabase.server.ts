import { createClient } from "@supabase/supabase-js";
import { serverConfig } from "~/lib/config.server";

export const supabaseAdmin = createClient(
    serverConfig.SUPABASE_URL,
    serverConfig.SUPABASE_SECRET_KEY
);
