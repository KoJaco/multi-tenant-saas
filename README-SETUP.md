# Setup Guide

Complete setup instructions for getting the multi-tenant SaaS template up and running from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** and npm installed ([download](https://nodejs.org/))
- A code editor (VS Code recommended)
- Git installed

## Quick Start

```bash
# 1. Clone the repository
git clone <____>
cd multi-tenant

# 2. Install dependencies
npm install

# 3. Set up environment variables (see below)
cp .env.example .env
# Edit .env with your values

# 4. Run setup script (does migrations, RLS, seeding)
npm run setup

# 5. Start development server
npm run dev
```

Visit `http://localhost:5173` to see your application!

---

## Required Integrations

These are **required** to get the application running.

### 1. PostgreSQL Database

**Required**: Yes  
**Options**:

- Supabase (recommended - includes PostgreSQL + Auth)
- Self-hosted PostgreSQL
- Managed PostgreSQL (AWS RDS, Railway, etc.)

#### Option A: Supabase (Recommended)

1. **Create a Supabase account**: [supabase.com](https://supabase.com)
2. **Create a new project**:
    - Click "New Project"
    - Choose organization
    - Enter project name and database password (make sure you copy this over to the env file as you'll need this for the next step)
    - Select region closest to you
    - Wait for project to be created (~2 minutes)

3. **Get your database connection string**:
    - Go to **Settings → Database**
    - Under "Connection string", select "URI"
    - Copy the connection string (looks like: `postgresql://postgres.<project_id>:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`)
        - Note that [YOUR-PASSWORD] is the database password you set when creating the project
        - Set the `DATABASE_URL` environment variable in your `.env` file

4. **Get your Supabase API keys**:
    - Go to **Project Settings → API Keys**
    - Copy these values:
        - **publishable key** key → `SUPABASE_PUBLISHABLE_KEY`
        - **service_role secret** key → `SUPABASE_SECRET_KEY`

#### Test Your Supabase Connection

1. Run migrations: `npm run migrate`

After migrations sucessfully ran and you've configured Supabase, test your connection:

```bash
npm run test-supabase-connection
# or
tsx scripts/test-supabase-connection.ts
```

This script will verify:

- ✅ Environment variables are set correctly (DATABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY)
- ✅ Database connection works
- ✅ Database schema is set up (after migrations)

**If tests pass**, you're ready to proceed with RLS policies!

---

#### Option B: Self-Hosted PostgreSQL

Coming soon...

---

### 2. Apply Row-Level Security (RLS) Policies

**Required**: Yes  
**When**: After migrations, before creating users  
**Why**: RLS policies enforce tenant isolation at the database level, ensuring users can only access data from their own account.

#### Apply RLS Policies

You have two options to apply RLS policies:

**Option A: Via Supabase SQL Editor (Recommended)**

1. Go to your Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Open `scripts/apply-rls-policies.sql` in your code editor
4. Copy the entire contents of the file
5. Paste into the SQL Editor
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)

**Option B: Via psql**

```bash
psql $DATABASE_URL -f scripts/apply-rls-policies.sql
```

#### What RLS Policies Do

The script will:

- ✅ Create `get_user_account_id()` helper function
- ✅ Enable RLS on all tenant-scoped tables:
    - `accounts`, `users`, `roles`, `permissions`
    - `role_users`, `permission_roles`
    - `user_invitations`, `user_preferences`, `user_profiles`
    - `credit_balances`, `credit_ledger`
    - `usage_counters`, `usage_events`, `usage_metrics`
    - `subscriptions`, `subscription_items`, `notifications`
- ✅ Create SELECT/INSERT/UPDATE/DELETE policies for each table
- ✅ Ensure users can only access data from their own account

**Note**: Tables like `plans`, `prices`, `stripe_webhook_events`, and `webhook_events` do NOT have RLS enabled as they are global/shared data.

#### Test RLS Policies

After applying RLS policies, verify they're working:

**Option A: Automated Test (Recommended)**

Run the comprehensive RLS test script:

```bash
npm run test-rls-policies
# or
tsx scripts/test-rls-policies.ts
```

This script will:

- ✅ Create test accounts and users
- ✅ Test tenant isolation (users can only see their own account's data)
- ✅ Test soft-delete filtering (users can't see soft-deleted records)
- ✅ Test role-based access control (admins/owners have elevated permissions)
- ✅ Test system-only restrictions (users can't modify certain tables)
- ✅ Clean up test data automatically

**Option B: Manual Verification**

```bash
# Test that RLS is enabled (this will show all tables with RLS)
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('accounts', 'users', 'roles');"

# Test that get_user_account_id() function exists
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'get_user_account_id';"
```

You should see:

- ✅ Tables listed in the first query
- ✅ Function `get_user_account_id` exists

**If tests pass**, RLS policies are properly applied!

**To Remove Data**, run the cleanup script:

```bash
npm run remove-test-rls-data
# or
tsx scripts/remove-test-rls-data.ts
```

---

### 3. Configure Supabase Authentication

**Required**: Yes (even if using self-hosted PostgreSQL)  
**Why**: The application uses Supabase Auth for user authentication, email verification, password reset, and OAuth. For the moment, this is the only supported authentication provider.

#### Step 1: Configure Email Authentication

Email authentication is enabled by default. No action needed, but you can verify:

1. Go to **Authentication → Sign In / Providers**
2. Ensure **Email** is enabled
3. Configure email settings if needed:
    - **Enable email confirmations**: Recommended for production
    - **Secure email change**: Recommended

#### Step 2: Configure Google OAuth (Social Auth)

**Required**: Yes (for social login functionality)

1. **Create Google OAuth Credentials**:
    - Go to [Google Cloud Console](https://console.cloud.google.com/)
    - Create a new project or select an existing one
    - Go to **APIs & Services → Credentials**
    - Click **Create Credentials → OAuth client ID**
    - Choose **Web application**
    - Configure:
        - **Name**: Your app name (e.g., "My SaaS App")
        - **Authorized JavaScript origins**:
            - `http://localhost:5173` (for development)
            - `https://yourdomain.com` (for production)
        - **Authorized redirect URIs**:
            - `https://<your-project-ref>.supabase.co/auth/v1/callback`
            - Find your project ref in Supabase Dashboard → Settings → General → Reference ID
    - Click **Create**
    - **Copy the Client ID and Client Secret** (you'll need these next)

2. **Configure Google Provider in Supabase**:
    - Go to Supabase Dashboard → **Authentication → Providers**
    - Find **Google** in the list
    - Click to enable/configure
    - Enter:
        - **Client ID (for OAuth)**: Your Google Client ID
        - **Client Secret (for OAuth)**: Your Google Client Secret
    - Click **Save**

3. **Test Google OAuth**:
    - Start your dev server: `npm run dev`
    - Visit `http://localhost:5173/login`
    - Click "Sign in with Google"
    - You should be redirected to Google for authorization
    - After authorizing, you'll be redirected back and logged in

**Troubleshooting Google OAuth**:

- **"redirect_uri_mismatch"**: Ensure the redirect URI in Google Console matches exactly: `https://<project-ref>.supabase.co/auth/v1/callback`
- **"invalid_client"**: Double-check your Client ID and Secret in Supabase
- **Not redirecting**: Ensure Google provider is enabled in Supabase Dashboard

#### Step 3: Configure Email Templates (Optional but Recommended)

Customize email templates for a better user experience:

1. Go to **Authentication → Email Templates**
2. Customize templates for:
    - **Confirm signup**: Email verification
    - **Reset password**: Password reset emails
    - **Magic link**: Passwordless login
    - **Invite user**: User invitations (if using)
3. Or use default templates (they work fine for development)
4. Also set site URL in **Authentication → URL Configuration** to your dev url (http://localhost:5173)

**Tip**: You can sync email templates from code using:

```bash
SUPABASE_ACCESS_TOKEN=your-token PROJECT_REF=your-project-ref tsx scripts/sync-supabase-email-templates.ts
```

---

### 4. Seed Database (Optional)

**Required**: No  
**When**: After RLS policies and authentication are configured  
**Why**: Seeds the database with test data for development and testing.

#### Seed with Demo Data

The seed script creates:

- 3 test accounts with different plans
- Multiple users per account with different roles
- Custom roles (Manager, Viewer) in addition to default roles
- Permissions for all entities
- Role-permission assignments
- Sample user invitations
- Credit balances

**Run the seed script**:

```bash
npm run seed
# or
tsx scripts/seed-database.ts
```

**Test Credentials** (all passwords: `password123`):

- **Acme Corporation** (pro plan):
    - `alice@acme.com` (owner)
    - `bob@acme.com` (admin)
    - `charlie@acme.com` (user)

- **TechStart Inc** (free plan):
    - `david@techstart.com` (owner)
    - `eve@techstart.com` (admin)

- **Global Solutions** (free plan):
    - `frank@global.com` (owner)
    - `grace@global.com` (user)

**Note**: The seed script handles existing users gracefully. If users already exist, they'll be skipped.
**Note**: To test email flows, you'll obviously need working email credentials. It is recommended to set up an SMTP server too (I used Brevo).

---

### 5. Application Configuration

**Required**: Yes

#### Environment Variables

Create a `.env` file in the project root:

```env
# Application
NODE_ENV=development
APP_URL=http://localhost:5173

# Database (from Supabase or PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# Supabase (from Supabase Dashboard → Settings → API)
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key

# Session Security (generate a random 32+ character string)
SESSION_SECRET=your-super-secret-session-key-minimum-32-characters-long
```

**Generate SESSION_SECRET**:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use any random string generator (32+ characters)
```

---

## Optional Integrations

These are **optional** but add functionality. You can add them later.

### 5. Stripe (Payments)

**Required**: No (optional)  
**When to add**: When you need payment processing, subscriptions, or billing features.

#### Setup Steps

1. **Create a Stripe account**: [stripe.com](https://stripe.com)

2. **Get API keys**:
    - Go to **Developers → API keys**
    - Copy **Publishable key** (starts with `pk_test_` or `pk_live_`)
    - Copy **Secret key** (starts with `sk_test_` or `sk_live_`)
    - **Use test keys** for development (`sk_test_...`)

3. **Set up webhooks** (for production):
    - Go to **Developers → Webhooks**
    - Click "Add endpoint"
    - Endpoint URL: `https://yourdomain.com/webhooks/stripe`
    - Select events to listen to:
        - `customer.subscription.created`
        - `customer.subscription.updated`
        - `customer.subscription.deleted`
        - `payment_intent.succeeded`
        - `payment_intent.payment_failed`
    - Copy the **Signing secret** (starts with `whsec_`)

**Environment Variables**:

```env
# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_your-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

**Note**: Without Stripe, the app will create fake products/prices in development mode. Payment features will be disabled.

---

### 6. Email Service (Transactional Emails)

**Required**: No (optional)  
**Default**: Uses Supabase Auth emails (signup, password reset)  
**When to add**: When you need custom transactional emails (notifications, invitations, etc.)

#### Option A: SendGrid

1. **Create SendGrid account**: [sendgrid.com](https://sendgrid.com)
2. **Create API key**:
    - Go to **Settings → API Keys**
    - Click "Create API Key"
    - Name it and copy the key
3. **Verify sender email**:
    - Go to **Settings → Sender Authentication**
    - Verify your sender email address

**Environment Variables**:

```env
EMAIL_ADAPTER=sendgrid
SENDGRID_API_KEY=SG.your-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

#### Option B: Resend

1. **Create Resend account**: [resend.com](https://resend.com)
2. **Get API key**:
    - Go to **API Keys**
    - Click "Create API Key"
    - Copy the key
3. **Verify domain** (optional):
    - Go to **Domains**
    - Add and verify your domain

**Environment Variables**:

```env
EMAIL_ADAPTER=resend
RESEND_API_KEY=re_your-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Note**: If not configured, the app uses Supabase Auth emails (which only work for auth-related emails).

---

### 7. Redis (Rate Limiting & Caching)

**Required**: No (optional)  
**Default**: Uses in-memory adapter (single server only)  
**When to add**: When deploying to production with multiple servers or need persistent rate limiting.

#### Setup Steps

1. **Create Redis instance**:
    - **Upstash** (recommended): [upstash.com](https://upstash.com) - Free tier available
    - **Railway**: [railway.app](https://railway.app)
    - **Redis Cloud**: [redis.com](https://redis.com)
    - **Self-hosted**: Install Redis locally or on server

2. **Get connection URL**:
    - Format: `redis://username:password@host:port`
    - Or: `rediss://username:password@host:port` (SSL)

**Environment Variable**:

```env
REDIS_URL=redis://user:password@host:6379
```

**Note**: Without Redis, rate limiting uses in-memory storage (resets on server restart). Fine for development, but use Redis in production.

---

### 8. Observability (Error Tracking & Monitoring)

**Required**: No (optional)  
**When to add**: When you need production monitoring and error tracking.

#### Option A: Sentry

1. **Create Sentry account**: [sentry.io](https://sentry.io)
2. **Create a project**:
    - Select "React" as platform
    - Copy the DSN

**Environment Variables**:

```env
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
```

#### Option B: Rollbar

1. **Create Rollbar account**: [rollbar.com](https://rollbar.com)
2. **Create a project**
3. **Get access token**:
    - Go to **Settings → Project Access Tokens**
    - Copy the token

**Environment Variables**:

```env
ROLLBAR_ACCESS_TOKEN=your-access-token
ROLLBAR_ENVIRONMENT=production
```

#### Option C: Honeycomb

1. **Create Honeycomb account**: [honeycomb.io](https://honeycomb.io)
2. **Get API key**:
    - Go to **Settings → API Keys**
    - Create a new key
    - Copy the key and dataset name

**Environment Variables**:

```env
HONEYCOMB_API_KEY=your-api-key
HONEYCOMB_DATASET=your-dataset-name
```

**Note**: You can use multiple observability tools simultaneously.

---

### 9. Branding

**Required**: No (optional)  
**When to add**: To customize your application name.

**Environment Variables**:

```env
APP_NAME=My SaaS Application
APP_SHORT_NAME=MyApp
```

---

## Setup Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment Variables

1. **Copy example file**:

    ```bash
    cp .env.example .env
    ```

2. **Edit `.env`** with your values:
    - Required: Database, Supabase, APP_URL, SESSION_SECRET
    - Optional: Stripe, Email, Redis, Observability, Branding

### Step 3: Run Database Setup

The `npm run setup` command does everything:

- Runs database migrations (creates tables)
- Applies RLS policies (tenant isolation)
- Seeds Stripe products (or creates fake ones)
- Creates demo account with test users

```bash
npm run setup
```

**What this does**:

- Creates all database tables
- Applies Row-Level Security policies
- Creates demo account with users:
    - `demo@example.com` / `demo123456` (owner)
    - `admin@example.com` / `admin123456` (admin)
    - `user@example.com` / `user123456` (user)

**Manual Setup** (if you prefer step-by-step):

```bash
# 1. Run migrations
npm run migrate

# 2. Apply RLS policies (choose one method)
# Option A: Via Supabase SQL Editor (recommended)
# - Open Supabase Dashboard → SQL Editor
# - Copy/paste contents of scripts/apply-rls-policies.sql
# - Run the SQL

# Option B: Via psql
psql $DATABASE_URL -f scripts/apply-rls-policies.sql

# 3. Create superuser (optional - setup script creates demo users)
tsx scripts/create-superuser.ts
```

### Step 4: Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` and log in with demo credentials!

---

## Verification Checklist

After setup, verify everything works:

- [ ] Development server starts without errors
- [ ] Can visit `http://localhost:5173`
- [ ] Can sign up / log in with demo credentials
- [ ] Dashboard loads after login
- [ ] Can create new users
- [ ] Database queries work (no RLS errors)
- [ ] Email verification works (check Supabase Auth logs)
- [ ] (Optional) Stripe products appear in billing section
- [ ] (Optional) Can send test emails (if email adapter configured)

---

## Troubleshooting

### "Invalid server environment configuration" Error

**Problem**: Missing or invalid environment variables.

**Solution**:

- Check `.env` file exists in project root
- Verify all required variables are set (see Required Integrations above)
- Ensure `SESSION_SECRET` is 32+ characters
- Restart development server after changing `.env`

### Database Connection Errors

**Problem**: Cannot connect to database.

**Solution**:

- Verify `DATABASE_URL` is correct
- Check database is running (if self-hosted)
- For Supabase: Verify project is active and password is correct
- Test connection: `psql $DATABASE_URL`

### RLS Policy Errors

**Problem**: "Permission denied" or "RLS policy violation" errors.

**Solution**:

- Ensure RLS policies were applied: Check `scripts/apply-rls-policies.sql` was run
- Verify `get_user_account_id()` function exists in database
- Check user has valid `account_id` in users table
- Ensure you're authenticated (have valid session)

### Supabase Auth Errors

**Problem**: Authentication not working.

**Solution**:

- Verify Supabase project is active
- Check API keys are correct (from Settings → API)
- Ensure `DATABASE_URL` matches your project URL exactly
- Check Supabase Dashboard → Authentication → Users for errors

### Stripe Errors

**Problem**: Stripe features not working.

**Solution**:

- Verify `STRIPE_SECRET_KEY` is set (if using Stripe features)
- Check you're using test keys (`sk_test_...`) in development
- Ensure Stripe products exist (run `npm run setup` to seed)
- Without Stripe: App uses fake products in dev mode (this is normal)

---

## Next Steps

- **[Architecture Guide](docs/ARCHITECTURE.md)**: Understand the system design
- **[Multi-Tenancy Guide](docs/MULTI_TENANCY.md)**: Learn about tenant isolation
- **[Authentication Guide](docs/AUTH.md)**: Configure OAuth providers
- **[Stripe Integration](docs/STRIPE.md)**: Set up payments and subscriptions
- **[Deployment Guide](docs/DEPLOYMENT.md)**: Deploy to production
- **[Environment Variables](docs/ENVIRONMENT.md)**: Complete environment reference

---

## Quick Reference

### Required Environment Variables

```env
NODE_ENV=development
APP_URL=http://localhost:5173
DATABASE_URL=postgresql://...
DATABASE_URL=https://...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SESSION_SECRET=...
```

### Optional Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
EMAIL_ADAPTER=sendgrid|resend
SENDGRID_API_KEY=...
RESEND_API_KEY=...

# Redis
REDIS_URL=redis://...

# Observability
SENTRY_DSN=...
ROLLBAR_ACCESS_TOKEN=...
HONEYCOMB_API_KEY=...

# Branding
APP_NAME=...
APP_SHORT_NAME=...
```

### Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run typecheck        # Type check

# Database
npm run migrate             # Run migrations
npm run setup               # Full setup (migrations + RLS + seeding)
npm run test-supabase-connection   # Test Supabase connection
tsx scripts/create-superuser.ts  # Create admin user

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

---

**Need help?** Check the [documentation](docs/) or review the [troubleshooting](#troubleshooting) section above.
