# Email Infrastructure

Unified email sending infrastructure with support for multiple providers and Supabase email template management.

## Overview

The email infrastructure provides:

- **Unified adapter pattern** for email providers
- **Supabase integration** for auth emails
- **Transactional email support** via SendGrid/Resend
- **Template management** with Supabase sync
- **Type-safe email sending**

## Architecture

```
┌─────────────┐
│ Application │
└──────┬──────┘
       │ sendEmail()
       ▼
┌─────────────────┐
│ Email Adapter   │
│    Factory      │
└──────┬──────────┘
       │
       ├──▶ Supabase (Auth emails)
       ├──▶ SendGrid (Transactional)
       └──▶ Resend (Transactional)
```

## Email Providers

### Supabase (Default)

**Use for**: Authentication emails (signup, password reset, etc.)

**Setup**: Already configured if using Supabase Auth

**Configuration**:

```env
# Already configured via Supabase setup
DATABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
```

**Note**: Supabase Auth handles auth emails automatically. This adapter is mainly for compatibility.

### SendGrid

**Use for**: Transactional emails (invitations, notifications, etc.)

**Setup**:

1. Install: `npm install @sendgrid/mail`
2. Get API key from [SendGrid Dashboard](https://app.sendgrid.com/settings/api_keys)
3. Configure:

```env
EMAIL_ADAPTER=sendgrid
SENDGRID_API_KEY=SG.your-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**Features**:

- Template support via `sendTemplate()`
- Attachments
- Tags and metadata

### Resend

**Use for**: Transactional emails (modern alternative to SendGrid)

**Setup**:

1. Install: `npm install resend`
2. Get API key from [Resend Dashboard](https://resend.com/api-keys)
3. Configure:

```env
EMAIL_ADAPTER=resend
RESEND_API_KEY=re_your-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Features**:

- Simple API
- Good deliverability
- Attachments

## Usage

### Basic Email Sending

```typescript
import { sendEmail } from "~/lib/email.server";

await sendEmail({
    to: { email: "user@example.com", name: "John Doe" },
    subject: "Welcome!",
    html: "<h1>Welcome</h1><p>Thanks for signing up!</p>",
    text: "Welcome! Thanks for signing up!",
});
```

### Multiple Recipients

```typescript
await sendEmail({
    to: [
        { email: "user1@example.com", name: "User 1" },
        { email: "user2@example.com", name: "User 2" },
    ],
    subject: "Team Update",
    html: "<p>Hello team!</p>",
});
```

### With Attachments

```typescript
import { readFileSync } from "fs";

await sendEmail({
    to: { email: "user@example.com" },
    subject: "Your Report",
    html: "<p>Please find your report attached.</p>",
    attachments: [
        {
            filename: "report.pdf",
            content: readFileSync("./report.pdf"),
            contentType: "application/pdf",
        },
    ],
});
```

### Templated Emails (SendGrid)

```typescript
import { sendTemplatedEmail } from "~/lib/email.server";

await sendTemplatedEmail(
    "d-1234567890abcdef", // SendGrid template ID
    { email: "user@example.com" },
    {
        name: "John",
        actionUrl: "https://example.com/confirm",
    }
);
```

### Helper Functions

```typescript
import { sendInvitationEmail, sendWelcomeEmail } from "~/lib/email.server";

// Send invitation
await sendInvitationEmail(
    "user@example.com",
    "https://app.com/invite/abc123",
    "Jane Doe",
    "Acme Corp"
);

// Send welcome email
await sendWelcomeEmail("user@example.com", "John Doe");
```

## Email Templates

### Supabase Email Templates

Supabase uses Go template syntax for email templates. Templates are defined in `app/lib/email/templates.ts` and can be synced to Supabase.

**Available Templates**:

- `confirmation` - Email confirmation
- `magic_link` - Magic link login
- `recovery` - Password reset
- `invite` - User invitation
- `reauthentication` - Reauthentication code
- `email_change` - Email change confirmation
- `password_changed_notification` - Password change notification
- `email_changed_notification` - Email change notification
- `phone_changed_notification` - Phone change notification
- `mfa_factor_enrolled_notification` - MFA enrollment notification
- `mfa_factor_unenrolled_notification` - MFA unenrollment notification
- `identity_linked_notification` - Identity link notification
- `identity_unlinked_notification` - Identity unlink notification

### Template Variables

Supabase templates support these variables:

- `{{ .ConfirmationURL }}` - Confirmation/reset link
- `{{ .SiteURL }}` - Site URL
- `{{ .Email }}` - User email
- `{{ .OldEmail }}` - Previous email (for email change)
- `{{ .OldPhone }}` - Previous phone (for phone change)
- `{{ .Phone }}` - New phone
- `{{ .FactorType }}` - MFA factor type
- `{{ .Provider }}` - Identity provider
- `{{token}}` - Reauthentication token

### Syncing Templates to Supabase

Use the sync script to update Supabase email templates:

```bash
# Get your access token from:
# https://supabase.com/dashboard/account/tokens

# Get your project ref from:
# https://supabase.com/dashboard/project/_/settings/general

export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="your-project-ref"

tsx scripts/sync-supabase-email-templates.ts
```

**What it does**:

1. Fetches current Supabase templates
2. Updates all templates from `app/lib/email/templates.ts`
3. Preserves existing templates if not defined locally

**Example Output**:

```
📧 Syncing email templates to Supabase...

📥 Fetching current templates...
✅ Current templates fetched

📝 Found 13 templates to sync

  ✓ confirmation
    Subject: Confirm your signup
  ✓ magic_link
    Subject: Your Magic Link
  ✓ recovery
    Subject: Reset Your Password
  ...

📤 Updating templates...
✅ Templates updated successfully!

🎉 Sync complete!
```

### Customizing Templates

Edit templates in `app/lib/email/templates.ts`:

```typescript
export const emailTemplates = {
    confirmation: {
        type: "confirmation",
        subject: "Confirm your signup",
        html: `
            <h2>Confirm your signup</h2>
            <p>Welcome! Please confirm your email.</p>
            <p><a href="{{ .ConfirmationURL }}">Confirm</a></p>
        `.trim(),
    },
    // ... other templates
};
```

Then sync to Supabase:

```bash
tsx scripts/sync-supabase-email-templates.ts
```

## Configuration

### Environment Variables

```env
# Email Provider (default: supabase)
EMAIL_ADAPTER=supabase  # or sendgrid, resend

# SendGrid (if using SendGrid)
SENDGRID_API_KEY=SG.your-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Resend (if using Resend)
RESEND_API_KEY=re_your-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Provider Selection

The adapter is selected automatically based on `EMAIL_ADAPTER`:

1. **supabase** (default) - For auth emails via Supabase Auth
2. **sendgrid** - For transactional emails via SendGrid
3. **resend** - For transactional emails via Resend

## Best Practices

1. **Use Supabase for auth emails** - Let Supabase handle signup, password reset, etc.
2. **Use SendGrid/Resend for transactional** - Invitations, notifications, etc.
3. **Always include text version** - For email clients that don't support HTML
4. **Test templates locally** - Before syncing to Supabase
5. **Use helper functions** - For common email types (invitations, welcome, etc.)
6. **Handle errors gracefully** - Email sending can fail
7. **Rate limit email sending** - Prevent abuse
8. **Monitor delivery rates** - Track bounces and failures

## Troubleshooting

### Emails Not Sending

- Check `EMAIL_ADAPTER` is set correctly
- Verify API keys are valid
- Check provider dashboard for errors
- Review application logs

### Supabase Templates Not Updating

- Verify `SUPABASE_ACCESS_TOKEN` is valid
- Check `PROJECT_REF` is correct
- Ensure token has admin permissions
- Check Supabase API status

### SendGrid/Resend Errors

- Verify API keys are correct
- Check from email is verified
- Review provider documentation
- Check rate limits

## Examples

### Invitation Email

```typescript
import { sendInvitationEmail } from "~/lib/email.server";

// In your invitation route
await sendInvitationEmail(
    invitation.email,
    `${process.env.APP_URL}/auth/accept-invitation?token=${invitation.token}`,
    appUser.name,
    account.name
);
```

### Custom Transactional Email

```typescript
import { sendEmail } from "~/lib/email.server";

await sendEmail({
    to: { email: user.email, name: user.name },
    subject: "Your Order is Ready",
    html: `
        <h2>Order Ready</h2>
        <p>Hi ${user.name},</p>
        <p>Your order #${orderId} is ready for pickup.</p>
    `,
    text: `Hi ${user.name}, Your order #${orderId} is ready for pickup.`,
    tags: ["order", "notification"],
    metadata: {
        orderId: orderId,
        userId: user.id,
    },
});
```

## Next Steps

- **[Authentication](AUTH.md)**: Auth email handling
- **[Webhooks](WEBHOOKS.md)**: Webhook notifications
- **[Observability](OBSERVABILITY.md)**: Email delivery tracking
