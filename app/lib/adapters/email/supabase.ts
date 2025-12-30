/**
 * Supabase Email Adapter
 *
 * Uses Supabase Auth for sending authentication-related emails.
 * For transactional emails, use SendGrid or Resend adapters.
 */

import type { EmailAdapter, SendEmailOptions, SendEmailResult } from "../email";
import { serverConfig } from "~/lib/config.server";

/**
 * Supabase email adapter
 *
 * Note: Supabase Auth handles auth emails automatically (signup, password reset, etc.)
 * This adapter is mainly for compatibility and can be used to trigger Supabase auth emails
 */
export class SupabaseEmailAdapter implements EmailAdapter {
    /**
     * Send email via Supabase Auth
     *
     * Note: Supabase Auth emails are typically triggered through auth methods,
     * not directly through this adapter. This is mainly for compatibility.
     */
    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        // Supabase Auth emails are handled through auth methods
        // This adapter is mainly for compatibility
        // For transactional emails, use SendGrid or Resend

        throw new Error(
            "Supabase adapter is for auth emails only. Use SendGrid or Resend for transactional emails."
        );
    }

    /**
     * Verify Supabase is configured
     */
    async verify(): Promise<boolean> {
        return !!(
            serverConfig.SUPABASE_URL && serverConfig.SUPABASE_SECRET_KEY
        );
    }
}
