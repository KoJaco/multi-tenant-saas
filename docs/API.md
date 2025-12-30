# API Reference

Complete reference for all routes and endpoints.

## Table of Contents

- [Route Structure](#route-structure)
- [Authentication Routes](#authentication-routes)
- [Dashboard Routes](#dashboard-routes)
- [Marketing Routes](#marketing-routes)
- [API Endpoints](#api-endpoints)
- [Webhook Handlers](#webhook-handlers)
- [Request/Response Formats](#requestresponse-formats)
- [Error Handling](#error-handling)

## Route Structure

Routes are organized by feature using React Router's file-based routing:

```
app/routes/
├── _auth.*          # Authentication routes (public)
├── _dash.*          # Dashboard routes (protected)
├── _mkt.*           # Marketing site routes (public)
├── api.*            # API endpoints (protected)
└── webhooks.*       # Webhook handlers (public, signed)
```

### Route Prefixes

- `_auth.*`: Authentication routes (login, signup, password reset)
- `_dash.*`: Dashboard routes (require authentication)
- `_mkt.*`: Marketing site routes (public)
- `api.*`: API endpoints (require authentication)
- `webhooks.*`: Webhook handlers (require signature verification)

## Authentication Routes

All authentication routes are under `/auth/*`.

### POST `/auth/login`

Sign in with email and password.

**Request:**
```typescript
FormData {
    email: string;
    password: string;
    redirectTo?: string; // Default: "/dashboard"
    csrf_token: string;
}
```

**Response:**
- **Success (200)**: Redirects to `redirectTo` or `/dashboard`
- **Error (400)**: `{ error: string, status: number }`

**Security:**
- Rate limited: 5 attempts per 15 minutes
- CSRF protected
- Input validated with Zod

### POST `/auth/signup`

Create a new account and user.

**Request:**
```typescript
FormData {
    email: string;
    password: string;
    redirectTo?: string; // Default: "/dashboard"
    csrf_token: string;
}
```

**Response:**
- **Success (200)**: Redirects to email verification page
- **Error (400)**: `{ error: string, status: number }`

**What it does:**
1. Creates Supabase auth user
2. Creates account (transaction)
3. Creates user record
4. Creates default roles and permissions
5. Assigns owner role to user
6. Sends confirmation email

**Security:**
- Rate limited: 3 attempts per hour
- CSRF protected
- Input validated with Zod

### POST `/auth/forgot-password`

Request password reset email.

**Request:**
```typescript
FormData {
    email: string;
    csrf_token: string;
}
```

**Response:**
- **Success (200)**: `{ error: "", status: 200 }`
- **Error (400)**: `{ error: string, status: number }`

**Security:**
- Rate limited: 3 attempts per hour
- CSRF protected

### POST `/auth/reset-password`

Reset password with token from email.

**Request:**
```typescript
FormData {
    password: string;
    confirmPassword: string;
    csrf_token: string;
}
```

**Requirements:**
- User must have valid session (from reset link)

**Response:**
- **Success (200)**: Redirects to `/login?message=password-reset-success`
- **Error (400)**: `{ error: string, status: number }`

**Security:**
- Rate limited: 3 attempts per hour
- CSRF protected
- Password validation (min 8 chars, letter + number)

### POST `/auth/resend-confirmation`

Resend email confirmation.

**Request:**
```typescript
FormData {
    email: string;
    csrf_token: string;
}
```

**Response:**
- **Success (200)**: `{ error: "", status: 200 }`
- **Error (400)**: `{ error: string, status: number }`

**Security:**
- Rate limited: 3 attempts per hour
- CSRF protected

### GET `/auth/confirm`

Verify email address.

**Query Parameters:**
- `token_hash`: Verification token
- `type`: OTP type (`signup`, `email`, etc.)
- `next`: Redirect URL after verification

**Response:**
- **Success**: Redirects to `/dashboard` or `next`
- **Error**: Redirects to `/auth/error`

### GET `/auth/callback`

OAuth callback handler.

**Query Parameters:**
- `code`: OAuth authorization code
- `next`: Redirect URL after authentication

**Response:**
- **Success**: Redirects to `next` or `/dashboard`
- **Error**: Redirects to `/auth/error`

**What it does:**
1. Exchanges code for session
2. Creates/updates user and account if needed
3. Redirects to dashboard

### GET `/auth/social`

Initiate OAuth login.

**Query Parameters:**
- `provider`: OAuth provider (`google`, etc.)
- `redirectTo`: Redirect URL after authentication

**Response:**
- Redirects to OAuth provider

### POST `/auth/logout`

Sign out current user.

**Response:**
- Redirects to `/`

### GET `/auth/verify-email`

Email verification status page.

**Response:**
- Shows verification status
- Option to resend confirmation email

### GET `/auth/accept-invitation`

Accept user invitation.

**Query Parameters:**
- `token_hash`: Invitation token
- `access_token`: Access token (new format)
- `refresh_token`: Refresh token (new format)
- `type`: Must be `invite`

**Response:**
- **Success**: Redirects to `/auth/invitation-welcome` or password setup
- **Error**: Redirects to `/auth/error`

**What it does:**
1. Verifies invitation token
2. Creates/updates user
3. Assigns role from invitation
4. Sets up password if needed

## Dashboard Routes

All dashboard routes are under `/dashboard/*` and require authentication.

### GET `/dashboard`

Dashboard home page.

**Requirements:**
- Authentication required
- User must belong to an account

**Response:**
- Renders dashboard overview

### GET `/dashboard/account`

Account settings page.

**Requirements:**
- Authentication required
- User must have `account:retrieve` permission

**Response:**
- Renders account settings form

### POST `/dashboard/account`

Update account settings.

**Request:**
```typescript
FormData {
    name: string;
    billingEmail?: string;
    // ... other account fields
}
```

**Requirements:**
- Authentication required
- User must have `account:update` permission

**Response:**
- **Success (200)**: Redirects to `/dashboard/account`
- **Error (400)**: `{ error: string, status: number }`

### GET `/dashboard/account/users`

User management page.

**Requirements:**
- Authentication required
- User must have `users:retrieve` permission

**Response:**
- Renders list of users in account

### POST `/dashboard/account/users/invite`

Invite a new user.

**Request:**
```typescript
FormData {
    email: string;
    roleId: string;
}
```

**Requirements:**
- Authentication required
- User must have `users:create` permission

**Response:**
- **Success (200)**: `{ success: true }`
- **Error (400)**: `{ error: string, status: number }`

### GET `/dashboard/account/roles`

Role management page.

**Requirements:**
- Authentication required
- User must have `roles:retrieve` permission

**Response:**
- Renders list of roles

### POST `/dashboard/account/roles`

Create a new role.

**Request:**
```typescript
FormData {
    name: string;
    description?: string;
    accessLevel: number;
    permissionIds: string[]; // Array of permission IDs
}
```

**Requirements:**
- Authentication required
- User must have `roles:create` permission

**Response:**
- **Success (200)**: `{ role: Role }`
- **Error (400)**: `{ error: string, status: number }`

### GET `/dashboard/account/permissions`

Permission management page.

**Requirements:**
- Authentication required
- User must have `permissions:retrieve` permission

**Response:**
- Renders list of permissions

### GET `/dashboard/account/billing`

Billing and subscription page.

**Requirements:**
- Authentication required
- User must have `billing:retrieve` permission

**Response:**
- Renders billing information and subscription status

## Marketing Routes

Marketing site routes are public (no authentication required).

### GET `/`

Marketing homepage.

**Response:**
- Renders marketing site with sections:
  - Hero
  - Features
  - Use cases
  - Pricing
  - How it works

### GET `/policies`

Policies index page.

**Response:**
- Links to privacy policy and terms of service

### GET `/policies/privacy-policy`

Privacy policy page.

### GET `/policies/terms-of-service`

Terms of service page.

## API Endpoints

API endpoints are under `/api/*` and require authentication.

### POST `/api/billing/credit-checkout`

Create Stripe checkout session for credit purchase.

**Request:**
```typescript
FormData {
    priceId: string; // Stripe price ID
    quantity?: number; // Default: 1
}
```

**Requirements:**
- Authentication required
- User must have `billing:create` permission

**Response:**
- **Success (200)**: Redirects to Stripe checkout
- **Error (400)**: `{ error: string, status: number }`

**What it does:**
1. Creates Stripe checkout session
2. Links session to account
3. Redirects to Stripe hosted checkout

## Webhook Handlers

Webhook handlers verify signatures and process events.

### POST `/webhooks/stripe`

Stripe webhook handler.

**Request Headers:**
- `stripe-signature`: Stripe webhook signature

**Request Body:**
- Raw Stripe event JSON

**Security:**
- Verifies Stripe webhook signature
- Uses `STRIPE_WEBHOOK_SECRET` for verification

**Supported Events:**
- `checkout.session.completed`: Process completed checkout
- `customer.subscription.updated`: Update subscription
- `customer.subscription.deleted`: Cancel subscription
- `invoice.payment_succeeded`: Process payment
- `invoice.payment_failed`: Handle failed payment

**Response:**
- **Success (200)**: `{ received: true }`
- **Error (400)**: `{ error: string }`

## Request/Response Formats

### Standard Response Format

All API responses follow this format:

```typescript
{
    error?: string;      // Error message (if error)
    status: number;      // HTTP status code
    data?: any;         // Response data (if success)
}
```

### Success Response

```typescript
{
    status: 200,
    data: { /* response data */ }
}
```

### Error Response

```typescript
{
    error: "User-friendly error message",
    status: 400
}
```

### Redirect Response

Some routes return redirects:

```typescript
redirect("/dashboard", { headers });
```

## Error Handling

### Error Status Codes

- **200**: Success
- **400**: Bad Request (validation error, invalid input)
- **401**: Unauthorized (not authenticated)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error

### Error Messages

Error messages are user-friendly and don't expose internal details:

```typescript
// ✅ Good
{ error: "Invalid email or password" }

// ❌ Bad
{ error: "Error: Invalid credentials at line 42" }
```

### Error Mapping

Authentication errors are mapped to user-friendly messages:

```typescript
import { mapAuthError } from "~/lib/auth/errors.server";

try {
    // Operation
} catch (error) {
    return createErrorResponse(mapAuthError(error), 400);
}
```

## Authentication

### Required Headers

Protected routes require:
- Valid session cookie (set automatically)
- CSRF token (for POST/PUT/DELETE requests)

### Getting Current User

```typescript
import { requireUser } from "~/lib/auth/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { appUser, accountId } = await requireUser(request);
    // appUser: User from database
    // accountId: User's account ID
}
```

### Checking Permissions

```typescript
import { hasPermission } from "~/lib/permissions.server";

const canCreate = await hasPermission(userId, "users", "create");
if (!canCreate) {
    return json({ error: "Insufficient permissions" }, { status: 403 });
}
```

## Rate Limiting

Some endpoints are rate limited:

- **Login**: 5 attempts per 15 minutes
- **Signup**: 3 attempts per hour
- **Password Reset**: 3 attempts per hour
- **Resend Confirmation**: 3 attempts per hour

Rate limit responses include:
- `Retry-After` header (seconds until retry allowed)
- `X-RateLimit-Limit` header (max requests)
- `X-RateLimit-Remaining` header (remaining requests)

## CSRF Protection

All POST/PUT/DELETE requests require CSRF tokens:

1. Get token from loader: `getCsrfTokenWithHeaders(request)`
2. Include in form: `<input type="hidden" name="csrf_token" value={token} />`
3. Validate in action: `await requireCsrfToken(request)`

## Next Steps

- **[Authentication & Authorization](AUTH.md)**: Auth system details
- **[Architecture](ARCHITECTURE.md)**: System architecture
- **[Database Schema](DATABASE.md)**: Database reference

