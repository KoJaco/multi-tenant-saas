/**
 * Email Template Definitions
 *
 * Defines email templates that can be synced to Supabase or used with other providers.
 * Templates use Go template syntax for Supabase compatibility.
 */

/**
 * Supabase email template types
 */
export type SupabaseEmailTemplateType =
    | "confirmation"
    | "magic_link"
    | "recovery"
    | "invite"
    | "reauthentication"
    | "email_change"
    | "password_changed_notification"
    | "email_changed_notification"
    | "phone_changed_notification"
    | "mfa_factor_enrolled_notification"
    | "mfa_factor_unenrolled_notification"
    | "identity_linked_notification"
    | "identity_unlinked_notification";

/**
 * Email template definition
 */
export interface EmailTemplate {
    type: SupabaseEmailTemplateType;
    subject: string;
    html: string;
    enabled?: boolean; // For notification templates
}

/**
 * Default email templates
 */
export const emailTemplates: Record<SupabaseEmailTemplateType, EmailTemplate> =
    {
        confirmation: {
            type: "confirmation",
            subject: "Confirm your signup",
            html: `
                <h2>Confirm your signup</h2>
                <p>Welcome! Please confirm your email address to complete your signup.</p>
                <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Confirm your email</a></p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}</p>
                <p>If you didn't create an account, you can safely ignore this email.</p>
            `.trim(),
        },

        magic_link: {
            type: "magic_link",
            subject: "Your One-time-password",
            html: `
                <h2>One time login code</h2>
                <p>Please enter this code: {{ .Token }}</p>
            `.trim(),
        },

        recovery: {
            type: "recovery",
            subject: "Reset Your Password",
            html: `
                <h2>Reset Your Password</h2>
                <p>We received a request to reset your password. Enter this code to verify your identity:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background-color: #f5f5f5; border-radius: 4px; font-family: monospace;">{{ .Token }}</p>
                <p>Go to <a href="{{ .SiteURL }}/auth/verify-otp?type=recovery" style="color: #007bff;">{{ .SiteURL }}/auth/verify-otp</a> to enter this code.</p>
                <p>This code will expire in 1 hour.</p>
                <p>If you didn't request a password reset, you can safely ignore this email.</p>
            `.trim(),
        },

        invite: {
            type: "invite",
            subject: "You have been invited",
            html: `
                <h2>You have been invited</h2>
                <p>You have been invited to join {{ .SiteURL }}. Click the link below to accept the invitation:</p>
                <p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Accept the invite</a></p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all;">{{ .ConfirmationURL }}</p>
            `.trim(),
        },

        reauthentication: {
            type: "reauthentication",
            subject: "Confirm reauthentication",
            html: `
                <h2>Confirm reauthentication</h2>
                <p>Enter the code below to confirm your identity:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 20px; background-color: #f5f5f5; border-radius: 4px;">{{token}}</p>
                <p>This code will expire in 10 minutes.</p>
            `.trim(),
        },

        email_change: {
            type: "email_change",
            subject: "Confirm email change",
            html: `
                <h2>Confirm email change</h2>
                <p>We received a request to change your email address. Click the link below to confirm:</p>
                <p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Change email</a></p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all;">{{ .ConfirmationURL }}</p>
                <p>If you didn't request this change, please contact support immediately.</p>
            `.trim(),
        },

        password_changed_notification: {
            type: "password_changed_notification",
            subject: "Your password has been changed",
            html: `
                <h2>Your password has been changed</h2>
                <p>This is a confirmation that the password for your account {{ .Email }} has just been changed.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        email_changed_notification: {
            type: "email_changed_notification",
            subject: "Your email address has been changed",
            html: `
                <h2>Your email address has been changed</h2>
                <p>The email address for your account has been changed from {{ .OldEmail }} to {{ .Email }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        phone_changed_notification: {
            type: "phone_changed_notification",
            subject: "Your phone number has been changed",
            html: `
                <h2>Your phone number has been changed</h2>
                <p>The phone number for your account {{ .Email }} has been changed from {{ .OldPhone }} to {{ .Phone }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        mfa_factor_enrolled_notification: {
            type: "mfa_factor_enrolled_notification",
            subject: "A new MFA factor has been enrolled",
            html: `
                <h2>A new MFA factor has been enrolled</h2>
                <p>A new factor ({{ .FactorType }}) has been enrolled for your account {{ .Email }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        mfa_factor_unenrolled_notification: {
            type: "mfa_factor_unenrolled_notification",
            subject: "An MFA factor has been unenrolled",
            html: `
                <h2>An MFA factor has been unenrolled</h2>
                <p>A factor ({{ .FactorType }}) has been unenrolled for your account {{ .Email }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        identity_linked_notification: {
            type: "identity_linked_notification",
            subject: "A new identity has been linked",
            html: `
                <h2>A new identity has been linked</h2>
                <p>A new identity ({{ .Provider }}) has been linked to your account {{ .Email }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },

        identity_unlinked_notification: {
            type: "identity_unlinked_notification",
            subject: "An identity has been unlinked",
            html: `
                <h2>An identity has been unlinked</h2>
                <p>An identity ({{ .Provider }}) has been unlinked from your account {{ .Email }}.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `.trim(),
            enabled: true,
        },
    };

/**
 * Get template by type
 */
export function getEmailTemplate(
    type: SupabaseEmailTemplateType
): EmailTemplate {
    return emailTemplates[type];
}

/**
 * Get all templates
 */
export function getAllEmailTemplates(): EmailTemplate[] {
    return Object.values(emailTemplates);
}
