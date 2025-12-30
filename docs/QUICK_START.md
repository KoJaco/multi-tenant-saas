# Quick Start Guide

Get your multi-tenant SaaS application up and running in minutes.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** and npm installed
- **PostgreSQL database** (or a Supabase account - recommended)
- **Supabase account** for authentication ([sign up here](https://supabase.com))
- **Stripe account** for payments ([sign up here](https://stripe.com)) - optional for initial setup

## Installation Steps

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd multi-tenant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required: Database
DATABASE_URL=postgresql://user:password@localhost:5432/multi_tenant

# Required: Supabase
DATABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
SUPABASE_SECRET_KEY=your-supabase-secret-key

# Required: Application
APP_URL=http://localhost:5173
SESSION_SECRET=your-super-secret-session-key-change-this

# Optional: Stripe (can add later)
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret

# Optional: Branding
APP_NAME=My SaaS App
APP_SHORT_NAME=MyApp
```

**Where to find these values:**

- **Supabase**: Dashboard → Settings → API
    - `DATABASE_URL`: Project URL
    - `SUPABASE_PUBLISHABLE_KEY`: `anon` `public` key
    - `SUPABASE_SECRET_KEY`: `service_role` `secret` key
- **Database**: Your PostgreSQL connection string
- **Stripe**: Dashboard → Developers → API keys

See [Environment Variables](ENVIRONMENT.md) for complete reference.

### 4. Run Database Migrations

Create all database tables:

```bash
npm run migrate
# or
tsx app/lib/db/migrate.ts
```

This will create all tables defined in `app/lib/db/schema.ts`.

### 5. Apply Row-Level Security (RLS) Policies

RLS policies ensure tenant data isolation at the database level:

**Option 1: Via Supabase SQL Editor (Recommended)**

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy the contents of `scripts/apply-rls-policies.sql`
4. Paste and run the SQL

**Option 2: Via psql**

```bash
psql $DATABASE_URL -f scripts/apply-rls-policies.sql
```

**What this does:**

- Enables RLS on all tenant-scoped tables
- Creates `get_user_account_id()` helper function
- Creates SELECT/INSERT/UPDATE/DELETE policies for each table
- Ensures users can only access their own account's data

### 6. Create a Superuser

Create your first admin account:

```bash
tsx scripts/create-superuser.ts
```

You'll be prompted for:

- Email address
- Password
- Account name

This creates:

- Supabase auth user
- Account record
- User record with owner role
- Default roles (Owner, Admin, User)
- Default permissions for all entities
- Initial credit balance

### 7. Start the Development Server

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## First Steps

### 1. Log In

Visit `http://localhost:5173/login` and sign in with your superuser credentials.

### 2. Explore the Dashboard

Once logged in, you'll see:

- **Dashboard**: Overview of your account
- **Account Settings**: Manage account details
- **Users**: Invite and manage team members
- **Roles**: Create and manage roles
- **Permissions**: Configure permissions
- **Billing**: Manage subscriptions (if Stripe is configured)

### 3. Invite Team Members

1. Go to **Dashboard → Account → Users**
2. Click **Invite User**
3. Enter email address and select role
4. User will receive an invitation email

### 4. Configure Roles and Permissions

1. Go to **Dashboard → Account → Roles**
2. Create custom roles or modify existing ones
3. Assign permissions to roles
4. Assign roles to users

## Development Workflow

### Running the Development Server

```bash
npm run dev
```

Features:

- Hot Module Replacement (HMR)
- TypeScript type checking
- Fast refresh for React components

### Building for Production

```bash
npm run build
```

This creates optimized production builds in the `build/` directory.

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript type checking and React Router type generation.

## Common Issues

### "Missing DATABASE_URL" Error

**Problem**: Environment variables not loaded.

**Solution**:

- Ensure `.env` file exists in project root
- Check that variable names match exactly (case-sensitive)
- Restart your development server after changing `.env`

### "User already exists" Error

**Problem**: Trying to create a user that already exists.

**Solution**:

- Use a different email address
- Or delete the existing user from Supabase Dashboard → Authentication → Users

### RLS Policies Blocking Queries

**Problem**: Getting permission denied errors.

**Solution**:

- Ensure you're authenticated (have a valid session)
- Check that `get_user_account_id()` function exists in database
- Verify user has a valid `account_id` in the users table
- Ensure RLS policies were applied correctly

### Database Connection Errors

**Problem**: Cannot connect to database.

**Solution**:

- Verify `DATABASE_URL` is correct
- Check database is running
- Ensure database user has proper permissions
- For Supabase: Check connection pooling settings

### Rate Limit Errors

**Problem**: Getting "Too many requests" errors.

**Solution**:

- This is expected behavior for security
- Wait for the rate limit window to reset
- In development, you can adjust limits in `app/lib/rate-limit.server.ts`

### CSRF Token Errors

**Problem**: "Invalid CSRF token" errors on form submissions.

**Solution**:

- Ensure forms include the CSRF token hidden input
- Check that session cookies are working
- Verify `SESSION_SECRET` is set

## Next Steps

- **[Architecture](ARCHITECTURE.md)**: Understand the system design
- **[Multi-Tenancy Guide](MULTI_TENANCY.md)**: Learn about tenant isolation
- **[Authentication & Authorization](AUTH.md)**: Configure auth providers
- **[Stripe Integration](STRIPE.md)**: Set up payments
- **[Production Adapters](ADAPTERS.md)**: Scale with Redis
- **[Deployment Guide](DEPLOYMENT.md)**: Deploy to production

## Getting Help

- Check the [documentation index](../README.md)
- Review [Architecture Documentation](ARCHITECTURE.md)
- See [Troubleshooting](#common-issues) above

## Seed Database (Development Only)

For development and testing, you can seed the database with test data:

```bash
tsx scripts/seed-database.ts
```

**Warning**: Never run this in production!

This creates:

- 3 test accounts
- Multiple users with different roles
- Sample permissions and role assignments
- Test invitations and credit balances

**Test Credentials** (all passwords: `password123`):

- `alice@acme.com` (owner)
- `bob@acme.com` (admin)
- `charlie@acme.com` (user)

See [scripts/README.md](../scripts/README.md) for more details.
