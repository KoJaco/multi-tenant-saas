# Testing Framework Architecture

Comprehensive guide to the testing framework architecture, configuration, and patterns.

## Overview

The project uses a multi-layered testing approach:

- **Jest** for unit and integration tests (Node.js environment)
- **Cypress** for end-to-end tests (browser environment)
- **TypeScript** for type-safe test code

## Architecture

### Test Structure

```
app/
├── lib/
│   └── __tests__/
│       ├── *.test.ts              # Unit tests for lib modules
│       ├── auth/                  # Auth-specific tests
│       ├── db/                    # Database tests
│       ├── adapters/              # Adapter tests
│       ├── setup.ts               # Test utilities
│       └── jest-types.ts         # Jest type definitions
├── routes/
│   └── __tests__/
│       ├── *.test.ts              # Unit tests for route loaders/actions
│       └── *.integration.test.ts  # Integration tests for routes
├── components/
│   └── __tests__/
│       ├── ui/                    # UI component tests
│       ├── errors/                # Error component tests
│       └── *.test.tsx             # Feature component tests
cypress/
├── e2e/                          # E2E test files
├── support/                      # Cypress support files
│   ├── commands.ts               # Custom Cypress commands
│   └── e2e.ts                    # Global setup
└── fixtures/                     # Test data fixtures
```

## Jest Configuration

### Configuration File: `jest.config.js`

Key configuration points:

- **Preset**: `ts-jest/presets/default-esm` - ESM module support
- **Test Environment**: `node` - Server-side testing
- **Module Resolution**: Path aliases (`~/`) mapped to `app/`
- **Test Matching**: `**/__tests__/**/*.test.{ts,tsx}` and `**/?(*.)+(spec|test).{ts,tsx}`
- **Coverage**: Collects from `app/**/*.{ts,tsx}`, excludes test files
- **Setup**: `jest.setup.js` - Global test configuration

### Setup File: `jest.setup.js`

Configures:

- Environment variables for test environment
- Test timeout (30 seconds for integration tests)
- Global mocks and utilities

## Test Utilities

### `app/lib/__tests__/setup.ts`

Provides helper functions for test setup:

- **`createMockRequest(url, options?)`**: Creates a mock Request object
- **`createMockFormData(data)`**: Creates FormData from object
- **`createMockAppUser(overrides?)`**: Creates mock AppUser with defaults
- **`mockDbQuery(data, jestFn)`**: Creates mock database query results

### `app/lib/__tests__/jest-types.ts`

Provides typed Jest utilities:

- **`jest`**: Typed Jest mock functions
- **`expect`**: Jest assertions
- **`describe`, `it`, `beforeEach`, `afterEach`**: Test structure functions
- **`MockFn<TArgs, TReturn>`**: Typed mock function type
- **`JestMock<T>`**: Jest mock type helper

## Mocking Strategies

### Database Mocking

Mock Drizzle ORM queries:

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
        update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue(undefined),
            }),
        }),
    },
}));
```

### Auth Mocking

Mock authentication functions:

```typescript
jest.mock("~/lib/auth/auth.server", () => ({
    requireUser: jest.fn().mockResolvedValue({ appUser: mockUser }),
    requireAdmin: jest.fn().mockResolvedValue({ appUser: adminUser }),
    getSessionUser: jest.fn().mockResolvedValue(mockUser),
}));
```

### Request Context Mocking

Mock request context utilities:

```typescript
jest.mock("~/lib/request-context.server", () => ({
    initRequestContext: jest.fn((req: Request) => ({
        requestId: "test-123",
        path: new URL(req.url).pathname,
        method: req.method,
        userAgent: req.headers.get("user-agent"),
    })),
    withRequestContext: jest.fn(async (context, fn) => await fn()),
}));
```

### External Service Mocking

**Supabase:**

```typescript
jest.mock("~/lib/supabase.server", () => ({
    createServerClient: jest.fn().mockReturnValue({
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: mockUser } }),
        },
    }),
}));
```

**Stripe:**

```typescript
jest.mock("stripe", () => ({
    default: jest.fn().mockImplementation(() => ({
        customers: {
            create: jest.fn().mockResolvedValue({ id: "cus_123" }),
        },
    })),
}));
```

**Email Services:**

```typescript
jest.mock("~/lib/adapters/email", () => ({
    getEmailAdapter: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({ messageId: "msg-123" }),
    }),
}));
```

## Test Data Fixtures

### User Fixtures

```typescript
import { createMockAppUser } from "~/lib/__tests__/setup";

const adminUser = createMockAppUser({
    role: "admin",
    accountId: "account-123",
});

const regularUser = createMockAppUser({
    role: "user",
    accountId: "account-123",
});
```

### Request Fixtures

```typescript
import { createMockRequest } from "~/lib/__tests__/setup";

const getRequest = createMockRequest("http://localhost/api/test");
const postRequest = createMockRequest("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify({ data: "value" }),
    headers: { "Content-Type": "application/json" },
});
```

## Cypress Configuration

### Configuration File: `cypress.config.ts`

Key settings:

- **Base URL**: `http://localhost:5173` (dev server)
- **Viewport**: 1280x720
- **Video**: Disabled (can be enabled for debugging)
- **Screenshots**: Enabled on failure
- **Timeouts**: 10 seconds for commands/requests/responses

### Custom Commands

Located in `cypress/support/commands.ts`:

```typescript
// Login helper
Cypress.Commands.add("login", (email: string, password: string) => {
    cy.visit("/auth/login");
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();
});

// Create test account
Cypress.Commands.add("createTestAccount", (name: string) => {
    // Implementation
});
```

## Performance Considerations

### Test Execution Speed

- **Unit Tests**: Should run in < 100ms each
- **Integration Tests**: May take 1-5 seconds each
- **E2E Tests**: May take 10-30 seconds each

### Optimization Strategies

1. **Parallel Execution**: Jest runs tests in parallel by default
2. **Test Isolation**: Each test should be independent
3. **Mock Heavy Operations**: Mock database, API calls, file I/O
4. **Selective Test Running**: Use `--testPathPattern` to run specific tests
5. **Watch Mode**: Use `npm run test:watch` for faster feedback during development

## Coverage Reporting

### Running Coverage

```bash
npm run test:coverage
```

### Coverage Reports

- **Text**: Console output
- **LCOV**: `coverage/lcov.info` (for CI/CD)
- **HTML**: `coverage/index.html` (for local viewing)

### Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## CI/CD Integration

### GitHub Actions Workflow

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Lint & Type Check**: TypeScript compilation and linting
2. **Unit Tests**: Fast unit tests (no external dependencies)
3. **Integration Tests**: Tests with PostgreSQL service container
4. **E2E Tests**: Full Cypress tests (requires app to be running)
5. **Build**: Production build verification

### Environment Variables

Required for CI:

- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_URL`: Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY`: Supabase anonymous key
- `SUPABASE_SECRET_KEY`: Supabase secret key
- `SESSION_SECRET`: Session encryption secret
- `TEST_USER_EMAIL`: Test user email for E2E tests
- `TEST_USER_PASSWORD`: Test user password for E2E tests

## Troubleshooting

### Common Issues

**Jest ES Module Errors:**

- Ensure `package.json` has `"type": "module"`
- Verify `jest.config.js` uses ESM preset
- Check `ts-jest` configuration

**TypeScript Errors in Tests:**

- Use typed imports from `~/lib/__tests__/jest-types`
- Ensure test files use `.test.ts` or `.test.tsx` extension
- Check that mocks match actual function signatures

**Cypress Timeout Errors:**

- Increase timeout in `cypress.config.ts`
- Check that dev server is running
- Verify baseUrl is correct

**Database Connection Errors:**

- Check `DATABASE_URL` environment variable
- Ensure PostgreSQL is running (for integration tests)
- Verify database permissions

### Debugging Tips

1. **Run Single Test**: `npm test -- path/to/test.test.ts`
2. **Run in Watch Mode**: `npm run test:watch`
3. **Debug Jest**: Use `--inspect-brk` flag
4. **Debug Cypress**: Use `npm run test:e2e:open` for interactive mode
5. **Verbose Output**: Use `--verbose` flag for detailed output

## Best Practices Summary

1. **Test Organization**: Group related tests in describe blocks
2. **Test Naming**: Use descriptive test names that explain what is tested
3. **AAA Pattern**: Arrange, Act, Assert structure
4. **Mock Isolation**: Each test should mock its own dependencies
5. **Clean Setup**: Use `beforeEach` to reset state between tests
6. **Type Safety**: Use typed mocks and utilities
7. **Error Testing**: Test both success and error paths
8. **Edge Cases**: Test boundary conditions and edge cases
9. **Performance**: Keep tests fast and efficient
10. **Documentation**: Comment complex test setups and mocks

## Next Steps

- **[Testing Guide](TESTING.md)**: How to write and run tests
- **[Contributing Guide](CONTRIBUTING.md)**: Development guidelines
- **[CI/CD](DEPLOYMENT.md)**: Deployment pipeline
