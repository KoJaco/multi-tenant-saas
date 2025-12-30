/**
 * Email Adapter Factory
 *
 * Creates and initializes the appropriate email adapter based on configuration.
 */

import type { EmailAdapter } from "../email";
import { SupabaseEmailAdapter } from "./supabase";
import { SendGridEmailAdapter } from "./sendgrid";
import { ResendEmailAdapter } from "./resend";
import { serverConfig } from "~/lib/config.server";

let emailAdapter: EmailAdapter | null = null;

/**
 * Get or create the email adapter instance
 */
export async function getEmailAdapter(): Promise<EmailAdapter> {
    if (emailAdapter) {
        return emailAdapter;
    }

    const adapterType = serverConfig.EMAIL_ADAPTER?.toLowerCase() || "supabase";

    switch (adapterType) {
        case "sendgrid":
            try {
                emailAdapter = new SendGridEmailAdapter();
                return emailAdapter;
            } catch (error) {
                console.warn(
                    "Failed to initialize SendGrid adapter, falling back to Supabase",
                    error
                );
                emailAdapter = new SupabaseEmailAdapter();
                return emailAdapter;
            }

        case "resend":
            try {
                emailAdapter = new ResendEmailAdapter();
                return emailAdapter;
            } catch (error) {
                console.warn(
                    "Failed to initialize Resend adapter, falling back to Supabase",
                    error
                );
                emailAdapter = new SupabaseEmailAdapter();
                return emailAdapter;
            }

        case "supabase":
        default:
            emailAdapter = new SupabaseEmailAdapter();
            return emailAdapter;
    }
}

/**
 * Initialize email adapter (call at startup)
 */
export async function initEmail(): Promise<void> {
    await getEmailAdapter();
}
