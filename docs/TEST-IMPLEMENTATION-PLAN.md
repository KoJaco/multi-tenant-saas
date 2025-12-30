# Test Implementation Plan

Prioritized plan for implementing tests in the multi-tenant SaaS template, focusing on security-critical and business-critical functionality.

## Overview

This plan categorizes tests into three priority levels:
- **Must Have**: Security-critical and payment-critical functionality
- **Should Have**: Important features that prevent bugs and improve reliability
- **Nice to Have**: Removed - these tests are not necessary for a template

## Priority Levels

### 🔴 Must Have (Security & Money)

These tests are **critical** and must be implemented to ensure:
- Multi-tenant data isolation (prevents catastrophic data leaks)
- Payment processing integrity (prevents revenue loss)
- Authentication security (prevents unauthorized access)

#### Multi-Tenant Isolation Tests
**Priority: CRITICAL**

- [ ] `app/lib/__tests__/db/schema.test.ts`
  - Test schema enforces `accountId` on all tenant-scoped tables
  - Test foreign key constraints
  - Test RLS policy structure

- [ ] `app/lib/__tests__/db/index.server.test.ts`
  - Test database queries filter by `accountId`
  - Test RLS policies prevent cross-tenant access
  - Test transaction isolation

- [ ] `app/lib/__tests__/permissions.server.test.ts`
  - Test `checkPermission()` respects account boundaries
  - Test `requirePermission()` throws for unauthorized access
  - Test permission checks prevent cross-tenant access
  - Test access level hierarchy

#### Payment & Webhook Tests
**Priority: CRITICAL**

- [ ] `app/lib/__tests__/webhooks/stripe.server.test.ts`
  - Test webhook signature verification
  - Test webhook event processing
  - Test idempotency handling
  - Test error handling for invalid webhooks

- [ ] `app/lib/__tests__/webhooks/idempotency.server.test.ts`
  - Test duplicate webhook prevention
  - Test idempotency key generation
  - Test idempotency expiration

- [ ] `app/lib/__tests__/stripe-helpers.server.test.ts`
  - Test Stripe API wrapper functions
  - Test error handling for Stripe API failures
  - Test retry logic

- [ ] `app/routes/__tests__/webhooks.stripe.test.ts`
  - Test webhook route handler
  - Test webhook authentication

- [ ] `app/routes/__tests__/webhooks.stripe.integration.test.ts`
  - Test end-to-end webhook processing
  - Test webhook updates database correctly

- [ ] `app/routes/__tests__/api.billing.credit-checkout.test.ts`
  - Test checkout flow
  - Test payment processing

- [ ] `app/routes/__tests__/api.billing.credit-checkout.integration.test.ts`
  - Test end-to-end checkout flow
  - Test payment success/failure handling

#### Authentication Tests
**Priority: CRITICAL**

- [ ] `app/lib/__tests__/auth/auth.server.test.ts`
  - Test `requireUser()` throws for unauthenticated requests
  - Test `requireAdmin()` enforces admin role
  - Test session management
  - Test account isolation in auth checks

- [ ] `app/lib/__tests__/auth/validation.server.test.ts`
  - Test input validation for auth forms
  - Test email validation
  - Test password strength validation

- [ ] `app/lib/__tests__/auth/utils.server.test.ts`
  - Test auth utility functions
  - Test user lookup functions
  - Test account association

- [ ] `app/routes/__tests__/_auth.signup.test.ts`
  - Test signup flow
  - Test account creation
  - Test user creation

- [ ] `app/routes/__tests__/_auth.signup.integration.test.ts`
  - Test end-to-end signup flow
  - Test account isolation on signup

- [ ] `app/routes/__tests__/_auth.login.test.ts`
  - Test login flow
  - Test session creation

- [ ] `app/routes/__tests__/_auth.login.integration.test.ts`
  - Test end-to-end login flow
  - Test redirect after login

- [ ] `app/routes/__tests__/_auth.reset-password.test.ts`
  - Test password reset flow
  - Test token validation

#### Critical Route Integration Tests
**Priority: CRITICAL**

- [ ] `app/routes/__tests__/_dash.dashboard.account.users.test.ts`
  - Test user management respects account boundaries
  - Test users can only see their account's users

- [ ] `app/routes/__tests__/_dash.dashboard.account.roles.integration.test.ts`
  - Test role management
  - Test role assignment respects permissions

- [ ] `app/routes/__tests__/_dash.dashboard.account.permissions.test.ts`
  - Test permission management
  - Test permission checks prevent unauthorized access

- [ ] `app/routes/__tests__/_dash.dashboard.account.billings.integration.test.ts`
  - Test billing management
  - Test billing data isolation

---

### 🟡 Should Have (Important Features)

These tests improve reliability and prevent bugs but are not security-critical.

#### Error Handling Tests
**Priority: HIGH**

- [ ] `app/lib/__tests__/errors.server.test.ts`
  - Test error classification (user vs system)
  - Test error serialization doesn't leak sensitive data
  - Test error response creation
  - Test error handling middleware

#### Rate Limiting Tests
**Priority: HIGH**

- [ ] `app/lib/__tests__/rate-limit.server.test.ts`
  - Test rate limit middleware
  - Test rate limit enforcement
  - Test rate limit headers

- [ ] `app/lib/__tests__/adapters/rate-limit.test.ts`
  - Test rate limit adapter interface
  - Test in-memory adapter
  - Test rate limit window reset

#### Request Context Tests
**Priority: HIGH**

- [ ] `app/lib/__tests__/request-context.server.test.ts` ⚠️ **MISSING - CREATE**
  - Test AsyncLocalStorage context propagation
  - Test request ID extraction
  - Test IP address extraction
  - Test context isolation between requests
  - Test `withRequestContext()` wrapper

#### Audit Logging Tests
**Priority: MEDIUM**

- [ ] `app/lib/__tests__/audit/server.test.ts`
  - Test audit log creation
  - Test audit log includes request context
  - Test audit log respects account boundaries

#### CSRF Protection Tests
**Priority: MEDIUM**

- [ ] `app/lib/__tests__/csrf.server.test.ts`
  - Test CSRF token generation
  - Test CSRF token validation
  - Test CSRF protection middleware

#### Notifications Tests
**Priority: MEDIUM**

- [ ] `app/lib/__tests__/notifications.server.test.ts`
  - Test notification creation
  - Test notification filtering by account
  - Test notification read/unread status

---

## Implementation Order

### Phase 1: Critical Security (Week 1)
1. Multi-tenant isolation tests (`db/schema.test.ts`, `db/index.server.test.ts`, `permissions.server.test.ts`)
2. Authentication tests (`auth/auth.server.test.ts`, `auth/validation.server.test.ts`)
3. Critical route integration tests (user management, account isolation)

### Phase 2: Payment & Webhooks (Week 2)
1. Stripe webhook tests (`webhooks/stripe.server.test.ts`)
2. Payment processing tests (`stripe-helpers.server.test.ts`)
3. Billing route tests

### Phase 3: Important Features (Week 3)
1. Error handling tests (`errors.server.test.ts`)
2. Rate limiting tests (`rate-limit.server.test.ts`)
3. Request context tests (`request-context.server.test.ts` - CREATE)
4. CSRF protection tests (`csrf.server.test.ts`)

### Phase 4: Supporting Features (Week 4)
1. Audit logging tests (`audit/server.test.ts`)
2. Notifications tests (`notifications.server.test.ts`)
3. Remaining route integration tests

---

## Test Coverage Goals

- **Must Have**: 100% coverage (all critical paths tested)
- **Should Have**: 80% coverage (main paths tested)
- **Nice to Have**: 0% coverage (removed)

---

## Notes

- Focus on **integration tests** for routes - they test the full flow
- Unit tests are important for complex logic (permissions, rate limiting)
- E2E tests (Cypress) cover happy paths - unit/integration tests cover edge cases
- Mock external services (Stripe, Supabase) in tests
- Use test utilities from `app/lib/__tests__/setup.ts`

---

## Removed Tests (Nice to Have)

The following test files have been removed as they're not necessary for a template:

- Observability tests (`observability/*.test.ts`, `metrics.server.test.ts`, `logging.server.test.ts`)
- Adapter implementation tests (`adapters/metrics/*.test.ts`, `adapters/email/*.test.ts`, `adapters/cache.test.ts`)
- Utility function tests (`utils.test.ts`, `hooks/*.test.tsx`)
- Component tests (all `components/__tests__/*.test.tsx`)
- Marketing route tests (`_mkt.*.test.ts`)
- Other non-critical tests (`branding.server.test.ts`, `config.test.ts`, `pricing.test.ts`, etc.)

These can be added later if needed, but are not critical for a template.

