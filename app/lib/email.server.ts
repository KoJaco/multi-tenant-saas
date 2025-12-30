/**
 * Email Helper
 *
 * Convenience functions for sending emails throughout the application.
 * Automatically uses the configured email adapter.
 */

import { getEmailAdapter } from "./adapters/email";
import type {
    SendEmailOptions,
    EmailRecipient,
} from "./adapters/email";

/**
 * Send an email
 */
export async function sendEmail(options: SendEmailOptions) {
    const adapter = await getEmailAdapter();
    return adapter.send(options);
}

/**
 * Send a templated email (if supported by adapter)
 */
export async function sendTemplatedEmail(
    templateId: string,
    to: EmailRecipient | EmailRecipient[],
    templateData: Record<string, unknown>
) {
    const adapter = await getEmailAdapter();
    if (!adapter.sendTemplate) {
        throw new Error("Email adapter does not support templated emails");
    }
    return adapter.sendTemplate(templateId, to, templateData);
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
    email: string,
    invitationUrl: string,
    inviterName?: string,
    accountName?: string
) {
    const appName = process.env.APP_NAME || "Multi-Tenant SaaS";
    
    return sendEmail({
        to: { email },
        subject: `You've been invited to ${accountName || appName}`,
        html: `
            <h2>You've been invited</h2>
            <p>${inviterName || "Someone"} has invited you to join ${accountName || appName}.</p>
            <p><a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Accept Invitation</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${invitationUrl}</p>
        `,
        text: `
            You've been invited to ${accountName || appName}
            
            ${inviterName || "Someone"} has invited you to join.
            
            Accept your invitation: ${invitationUrl}
        `,
    });
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(
    email: string,
    name?: string
) {
    const appName = process.env.APP_NAME || "Multi-Tenant SaaS";
    
    return sendEmail({
        to: { email, name },
        subject: `Welcome to ${appName}!`,
        html: `
            <h2>Welcome to ${appName}!</h2>
            <p>Hi ${name || "there"},</p>
            <p>Thank you for signing up. We're excited to have you on board!</p>
            <p>Get started by exploring your dashboard.</p>
        `,
        text: `
            Welcome to ${appName}!
            
            Hi ${name || "there"},
            
            Thank you for signing up. We're excited to have you on board!
            
            Get started by exploring your dashboard.
        `,
    });
}

