#!/usr/bin/env tsx
/**
 * Sync Email Templates to Supabase
 *
 * Updates Supabase email templates with the templates defined in app/lib/email/templates.ts
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=your-token PROJECT_REF=your-project-ref tsx scripts/sync-supabase-email-templates.ts
 */

import { getAllEmailTemplates } from "../app/lib/email/templates";

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.PROJECT_REF;

if (!SUPABASE_ACCESS_TOKEN) {
    console.error("❌ SUPABASE_ACCESS_TOKEN environment variable is required");
    console.error("   Get your access token from: https://supabase.com/dashboard/account/tokens");
    process.exit(1);
}

if (!PROJECT_REF) {
    console.error("❌ PROJECT_REF environment variable is required");
    console.error("   Find your project ref in: https://supabase.com/dashboard/project/_/settings/general");
    process.exit(1);
}

const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

/**
 * Map template type to Supabase config keys
 */
function getSupabaseConfigKeys(type: string): {
    subjectKey: string;
    contentKey: string;
    enabledKey?: string;
} {
    const typeMap: Record<string, { subjectKey: string; contentKey: string; enabledKey?: string }> = {
        confirmation: {
            subjectKey: "mailer_subjects_confirmation",
            contentKey: "mailer_templates_confirmation_content",
        },
        magic_link: {
            subjectKey: "mailer_subjects_magic_link",
            contentKey: "mailer_templates_magic_link_content",
        },
        recovery: {
            subjectKey: "mailer_subjects_recovery",
            contentKey: "mailer_templates_recovery_content",
        },
        invite: {
            subjectKey: "mailer_subjects_invite",
            contentKey: "mailer_templates_invite_content",
        },
        reauthentication: {
            subjectKey: "mailer_subjects_reauthentication",
            contentKey: "mailer_templates_reauthentication_content",
        },
        email_change: {
            subjectKey: "mailer_subjects_email_change",
            contentKey: "mailer_templates_email_change_content",
        },
        password_changed_notification: {
            subjectKey: "mailer_subjects_password_changed_notification",
            contentKey: "mailer_templates_password_changed_notification_content",
            enabledKey: "mailer_notifications_password_changed_enabled",
        },
        email_changed_notification: {
            subjectKey: "mailer_subjects_email_changed_notification",
            contentKey: "mailer_templates_email_changed_notification_content",
            enabledKey: "mailer_notifications_email_changed_enabled",
        },
        phone_changed_notification: {
            subjectKey: "mailer_subjects_phone_changed_notification",
            contentKey: "mailer_templates_phone_changed_notification_content",
            enabledKey: "mailer_notifications_phone_changed_enabled",
        },
        mfa_factor_enrolled_notification: {
            subjectKey: "mailer_subjects_mfa_factor_enrolled_notification",
            contentKey: "mailer_templates_mfa_factor_enrolled_notification_content",
            enabledKey: "mailer_notifications_mfa_factor_enrolled_enabled",
        },
        mfa_factor_unenrolled_notification: {
            subjectKey: "mailer_subjects_mfa_factor_unenrolled_notification",
            contentKey: "mailer_templates_mfa_factor_unenrolled_notification_content",
            enabledKey: "mailer_notifications_mfa_factor_unenrolled_enabled",
        },
        identity_linked_notification: {
            subjectKey: "mailer_subjects_identity_linked_notification",
            contentKey: "mailer_templates_identity_linked_notification_content",
            enabledKey: "mailer_notifications_identity_linked_enabled",
        },
        identity_unlinked_notification: {
            subjectKey: "mailer_subjects_identity_unlinked_notification",
            contentKey: "mailer_templates_identity_unlinked_notification_content",
            enabledKey: "mailer_notifications_identity_unlinked_enabled",
        },
    };

    return typeMap[type] || {
        subjectKey: `mailer_subjects_${type}`,
        contentKey: `mailer_templates_${type}_content`,
    };
}

/**
 * Get current Supabase email templates
 */
async function getCurrentTemplates() {
    const response = await fetch(API_URL, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch templates: ${response.status} ${error}`);
    }

    return await response.json();
}

/**
 * Update Supabase email templates
 */
async function updateTemplates(payload: Record<string, unknown>) {
    const response = await fetch(API_URL, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update templates: ${response.status} ${error}`);
    }

    return await response.json();
}

/**
 * Main sync function
 */
async function syncTemplates() {
    console.log("📧 Syncing email templates to Supabase...\n");

    try {
        // Get current templates
        console.log("📥 Fetching current templates...");
        const current = await getCurrentTemplates();
        console.log("✅ Current templates fetched\n");

        // Get all templates from our definitions
        const templates = getAllEmailTemplates();
        console.log(`📝 Found ${templates.length} templates to sync\n`);

        // Build update payload
        const payload: Record<string, unknown> = {};

        for (const template of templates) {
            const keys = getSupabaseConfigKeys(template.type);
            
            payload[keys.subjectKey] = template.subject;
            payload[keys.contentKey] = template.html;

            if (keys.enabledKey !== undefined && template.enabled !== undefined) {
                payload[keys.enabledKey] = template.enabled;
            }

            console.log(`  ✓ ${template.type}`);
            console.log(`    Subject: ${template.subject}`);
            if (keys.enabledKey) {
                console.log(`    Enabled: ${template.enabled}`);
            }
        }

        // Update templates
        console.log("\n📤 Updating templates...");
        await updateTemplates(payload);
        console.log("✅ Templates updated successfully!\n");

        console.log("🎉 Sync complete!");
    } catch (error) {
        console.error("\n❌ Error syncing templates:");
        console.error(error);
        process.exit(1);
    }
}

// Run sync
syncTemplates();

