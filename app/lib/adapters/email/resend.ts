/**
 * Resend Email Adapter
 *
 * Resend email adapter for transactional emails.
 *
 * Setup:
 * 1. Install: npm install resend
 * 2. Set environment variable: RESEND_API_KEY=your-api-key
 * 3. Set EMAIL_ADAPTER=resend
 */

import type {
    EmailAdapter,
    SendEmailOptions,
    SendEmailResult,
    EmailRecipient,
} from "../email";
import { serverConfig } from "~/lib/config.server";

let resend: typeof import("resend") | null = null;
let resendClient: any = null;

async function initResend() {
    if (resendClient) return;

    try {
        resend = await import("resend");

        if (!serverConfig.RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY not configured");
        }

        resendClient = new resend.Resend(serverConfig.RESEND_API_KEY);
    } catch (error) {
        console.warn("Resend not available. Install with: npm install resend");
        throw error;
    }
}

export class ResendEmailAdapter implements EmailAdapter {
    private initialized = false;

    private async ensureInitialized() {
        if (!this.initialized) {
            await initResend();
            this.initialized = true;
        }
    }

    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        await this.ensureInitialized();
        if (!resendClient) {
            throw new Error("Resend not initialized");
        }

        try {
            const to = Array.isArray(options.to) ? options.to : [options.to];
            const from = options.from || {
                email: serverConfig.RESEND_FROM_EMAIL || "noreply@example.com",
                name: serverConfig.APP_NAME || "Multi-Tenant SaaS",
            };

            const result = await resendClient.emails.send({
                from: from.name ? `${from.name} <${from.email}>` : from.email,
                to: to.map((r) => r.email),
                replyTo: options.replyTo?.email,
                subject: options.subject,
                html: options.html,
                text: options.text,
                attachments: options.attachments?.map((att) => ({
                    filename: att.filename,
                    content: att.content.toString("base64"),
                    content_type: att.contentType,
                })),
                tags: options.tags,
            });

            if (result.error) {
                return {
                    success: false,
                    error: result.error.message || "Failed to send email",
                };
            }

            return {
                success: true,
                messageId: result.data?.id,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || "Failed to send email",
            };
        }
    }

    async verify(): Promise<boolean> {
        try {
            await this.ensureInitialized();
            return !!serverConfig.RESEND_API_KEY;
        } catch {
            return false;
        }
    }
}
