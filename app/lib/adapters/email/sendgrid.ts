/**
 * SendGrid Email Adapter
 *
 * SendGrid email adapter for transactional emails.
 *
 * Setup:
 * 1. Install: npm install @sendgrid/mail
 * 2. Set environment variable: SENDGRID_API_KEY=your-api-key
 * 3. Set EMAIL_ADAPTER=sendgrid
 */

import type {
    EmailAdapter,
    SendEmailOptions,
    SendEmailResult,
    EmailRecipient,
} from "../email";
import { serverConfig } from "~/lib/config.server";

let sendgrid: typeof import("@sendgrid/mail") | null = null;

async function initSendGrid() {
    if (sendgrid) return;

    try {
        sendgrid = await import("@sendgrid/mail");

        if (!serverConfig.SENDGRID_API_KEY) {
            throw new Error("SENDGRID_API_KEY not configured");
        }

        sendgrid.default.setApiKey(serverConfig.SENDGRID_API_KEY);
    } catch (error) {
        console.warn(
            "SendGrid not available. Install with: npm install @sendgrid/mail"
        );
        throw error;
    }
}

function normalizeRecipient(recipient: EmailRecipient): string {
    return recipient.name
        ? `${recipient.name} <${recipient.email}>`
        : recipient.email;
}

export class SendGridEmailAdapter implements EmailAdapter {
    private initialized = false;

    private async ensureInitialized() {
        if (!this.initialized) {
            await initSendGrid();
            this.initialized = true;
        }
    }

    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        await this.ensureInitialized();
        if (!sendgrid) {
            throw new Error("SendGrid not initialized");
        }

        try {
            const to = Array.isArray(options.to) ? options.to : [options.to];
            const from = options.from || {
                email:
                    serverConfig.SENDGRID_FROM_EMAIL || "noreply@example.com",
                name: serverConfig.APP_NAME || "Multi-Tenant SaaS",
            };

            const msg = {
                to: to.map(normalizeRecipient),
                from: normalizeRecipient(from),
                replyTo: options.replyTo
                    ? normalizeRecipient(options.replyTo)
                    : undefined,
                subject: options.subject,
                html: options.html,
                text: options.text,
                attachments: options.attachments?.map((att) => ({
                    filename: att.filename,
                    content: att.content.toString("base64"),
                    type: att.contentType,
                    disposition: "attachment",
                })),
                categories: options.tags,
                customArgs: options.metadata,
            };

            const [response] = await sendgrid.default.send(msg);

            return {
                success: true,
                messageId: response.headers["x-message-id"] as string,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || "Failed to send email",
            };
        }
    }

    async sendTemplate(
        templateId: string,
        to: EmailRecipient | EmailRecipient[],
        templateData: Record<string, unknown>
    ): Promise<SendEmailResult> {
        await this.ensureInitialized();
        if (!sendgrid) {
            throw new Error("SendGrid not initialized");
        }

        try {
            const recipients = Array.isArray(to) ? to : [to];
            const from = {
                email:
                    serverConfig.SENDGRID_FROM_EMAIL || "noreply@example.com",
                name: serverConfig.APP_NAME || "Multi-Tenant SaaS",
            };

            const msg = {
                to: recipients.map(normalizeRecipient),
                from: normalizeRecipient(from),
                templateId,
                dynamicTemplateData: templateData,
            };

            const [response] = await sendgrid.default.send(msg);

            return {
                success: true,
                messageId: response.headers["x-message-id"] as string,
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
            return !!serverConfig.SENDGRID_API_KEY;
        } catch {
            return false;
        }
    }
}
