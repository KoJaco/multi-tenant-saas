# Testing Guide

Comprehensive testing setup with unit tests, integration tests, and E2E tests.

## Overview

The testing infrastructure includes:

- **Unit Tests** - Jest for testing pure logic, utilities, and functions
- **Integration Tests** - Jest for testing routes with mocked DB and auth
- **E2E Tests** - Cypress for end-to-end user flows

## Test Structure

```
app/
├── lib/
│   ├── __tests__/          # Unit tests for lib functions
│   │   ├── *.test.ts       # Pure logic tests
│   │   └── setup.ts        # Test utilities
│   └── ...
├── routes/
│   └── __tests__/          # Route tests
│       ├── *.test.ts       # Unit tests for loaders/actions
│       └── *.integration.test.ts  # Integration tests
cypress/
├── e2e/                    # E2E test files
├── support/                # Cypress support files
│   ├── commands.ts         # Custom commands
│   └── e2e.ts             # Global setup
└── fixtures/               # Test fixtures (optional)
```

## Unit Tests

### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Example: Pure Logic Test

```typescript
// app/lib/__tests__/notifications.server.test.ts
import { createUserNotification } from "../notifications/server";

describe("createUserNotification", () => {
    it("should create a notification for a user", async () => {
        // Mock database
        const mockInsert = jest.fn()...

        const result = await createUserNotification({...});

        expect(result).toBe("notification-id");
    });
});
```

### Example: Route Loader Test

```typescript
// app/routes/__tests__/healthz.test.ts
import { loader } from "../healthz";

describe("Health Check Loader", () => {
    it("should return 200 OK", async () => {
        const request = new Request("http://localhost/healthz");
        const response = await loader({ request });

        expect(response.status).toBe(200);
    });
});
```

## Integration Tests

### Running Integration Tests

```bash
npm run test:integration
```

### Example: Route Integration Test

```typescript
// app/routes/__tests__/api.notifications.integration.test.ts
import { loader } from "../api.notifications";
import { requireUser } from "~/lib/auth/auth.server";

// Mock auth
jest.mock("~/lib/auth/auth.server");

describe("Notifications API Integration", () => {
    it("should return notifications for user", async () => {
        (requireUser as jest.Mock).mockResolvedValue({
            appUser: { id: "user-123", accountId: "account-123" },
        });

        const request = new Request("http://localhost/api/notifications");
        const response = await loader({ request });

        expect(response.status).toBe(200);
    });
});
```

## E2E Tests

### Running E2E Tests

```bash
# Run headless
npm run test:e2e

# Open Cypress UI
npm run test:e2e:open
```

### Test Flows

1. **Sign Up Flow** (`cypress/e2e/signup-flow.cy.ts`)
    - User signup
    - Account creation
    - Email verification

2. **Invite User Flow** (`cypress/e2e/invite-user-flow.cy.ts`)
    - Login as admin
    - Invite user to account
    - Handle duplicate invitations

3. **Stripe Checkout Flow** (`cypress/e2e/stripe-checkout-flow.cy.ts`)
    - Trigger checkout
    - Handle success/cancellation

### Custom Commands

```typescript
// Login helper
cy.login("user@example.com", "password");

// Create test account
cy.createTestAccount("Test Account");

// Wait for notifications
cy.waitForNotifications();
```

## Test Utilities

### Mock Helpers

Located in `app/lib/__tests__/setup.ts`:

```typescript
import {
    createMockRequest,
    createMockAppUser,
    createMockFormData,
} from "~/lib/__tests__/setup";

// Create mock request
const request = createMockRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
});

// Create mock user
const user = createMockAppUser({
    role: "admin",
    accountId: "account-123",
});

// Create mock form data
const formData = createMockFormData({
    email: "test@example.com",
    password: "password123",
});
```

### Database Mocking

```typescript
import { mockDbQuery } from "~/lib/__tests__/setup";
import { jest } from "@jest/globals";

// Mock database query
const mockUsers = [{ id: "user-1", email: "test@example.com" }];
const mockQuery = mockDbQuery(mockUsers, jest);

jest.mock("~/lib/db/index.server", () => ({
    db: {
        query: {
            users: mockQuery,
        },
    },
}));
```

### Jest Types

Use typed Jest utilities from `app/lib/__tests__/jest-types.ts`:

```typescript
import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
} from "~/lib/__tests__/jest-types";
import type { MockFn } from "~/lib/__tests__/jest-types";

// Typed mock function
const mockFn: MockFn<[string], Promise<string>> = jest.fn();
mockFn.mockResolvedValue("result");
```

## CI/CD Pipeline

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Lint & Type Check** - TypeScript and linting
2. **Unit Tests** - Fast unit tests
3. **Integration Tests** - Tests with PostgreSQL service
4. **E2E Tests** - Full Cypress tests
5. **Build** - Production build verification

### GitHub Actions Secrets

Required secrets for CI:

- `DATABASE_URL` - Test database URL
- `DATABASE_URL` - Supabase test project URL
- `SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `SUPABASE_SECRET_KEY` - Supabase secret key
- `SESSION_SECRET` - Session secret
- `TEST_USER_EMAIL` - Test user email
- `TEST_USER_PASSWORD` - Test user password

## Test Patterns

### Mocking Strategies

**Auth Mocking:**

```typescript
jest.mock("~/lib/auth/auth.server", () => ({
    requireUser: jest.fn().mockResolvedValue({ appUser: mockUser }),
    requireAdmin: jest.fn().mockResolvedValue({ appUser: adminUser }),
}));
```

**Database Mocking:**

```typescript
jest.mock("~/lib/db/index.server", () => ({
    db: {
        insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([{ id: "123" }]),
            }),
        }),
        query: {
            users: {
                findFirst: jest.fn().mockResolvedValue(mockUser),
                findMany: jest.fn().mockResolvedValue([mockUser]),
            },
        },
    },
}));
```

**Request Context Mocking:**

```typescript
jest.mock("~/lib/request-context.server", () => ({
    initRequestContext: jest.fn((req) => ({
        requestId: "test-123",
        path: new URL(req.url).pathname,
        method: req.method,
    })),
    withRequestContext: jest.fn(async (context, fn) => await fn()),
}));
```

## Best Practices

1. **Unit Tests**: Test pure logic, utilities, and functions with mocked dependencies
2. **Integration Tests**: Test routes with mocked DB/auth but real request flow
3. **E2E Tests**: Test critical user flows end-to-end in Cypress
4. **Mock External Services**: Mock Stripe, Supabase, email services in tests
5. **Use Test Utilities**: Leverage setup helpers (`setup.ts`, `jest-types.ts`) for consistency
6. **Keep Tests Fast**: Unit tests should be < 100ms each
7. **Isolate Tests**: Each test should be independent - use `beforeEach` to reset state
8. **Clean Up**: Reset mocks between tests with `jest.clearAllMocks()`
9. **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
10. **Descriptive Names**: Use clear test descriptions that explain what is being tested

## Troubleshooting

### Tests Failing

- Check environment variables are set
- Verify mocks are properly configured
- Ensure database is accessible (integration tests)

### Cypress Issues

- Ensure app is running (`npm run dev`)
- Check baseUrl in `cypress.config.ts`
- Verify test user credentials

### Jest ES Module Issues

- Ensure `jest.config.js` uses ESM preset
- Check `package.json` has `"type": "module"`
- Verify `ts-jest` configuration

## Next Steps

- **[CI/CD](DEPLOYMENT.md)**: Deployment pipeline setup
- **[Development](CONTRIBUTING.md)**: Development guidelines
