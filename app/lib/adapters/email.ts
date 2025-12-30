/**
 * Email Adapter Interface
 *
 * Provides a flexible adapter pattern for email sending.
 * Supports Supabase (auth emails), SendGrid, Resend, and other providers.
 */

/**
 * Email recipient
 */
export interface EmailRecipient {
    email: string;
    name?: string;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType?: string;
}

/**
 * Email options
 */
export interface SendEmailOptions {
    to: EmailRecipient | EmailRecipient[];
    from?: EmailRecipient;
    replyTo?: EmailRecipient;
    subject: string;
    html?: string;
    text?: string;
    attachments?: EmailAttachment[];
    tags?: string[];
    metadata?: Record<string, string>;
}

/**
 * Email sending result
 */
export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Email adapter interface
 */
export interface EmailAdapter {
    /**
     * Send an email
     */
    send(options: SendEmailOptions): Promise<SendEmailResult>;

    /**
     * Send a templated email (if supported)
     */
    sendTemplate?(
        templateId: string,
        to: EmailRecipient | EmailRecipient[],
        templateData: Record<string, unknown>
    ): Promise<SendEmailResult>;

    /**
     * Verify email adapter is configured correctly
     */
    verify?(): Promise<boolean>;
}

