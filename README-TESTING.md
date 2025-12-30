# Testing Setup

Quick reference for running tests.

## Installation

Test dependencies are already installed. If you need to reinstall:

```bash
npm install --save-dev jest ts-jest @types/jest @testing-library/react cypress
```

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

### Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm test -- --testPathPattern=integration path/to/test.integration.test.ts
```

### E2E Tests

```bash
# Run headless (requires dev server running)
npm run dev &  # Start dev server in background
npm run test:e2e

# Open Cypress UI (interactive mode)
npm run test:e2e:open
```

### All Tests

```bash
# Run unit and integration tests
npm run test:all

# Run all tests including E2E (requires dev server)
npm run test:unit && npm run test:integration && npm run test:e2e
```

## Test Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html
```

## Test Examples

See:

- `app/lib/__tests__/` - Unit test examples for lib modules
- `app/routes/__tests__/` - Route test examples (unit and integration)
- `app/components/__tests__/` - Component test examples
- `cypress/e2e/` - E2E test examples

## Common Commands

```bash
# Run tests matching pattern
npm test -- --testNamePattern="login"

# Run tests in specific directory
npm test -- app/lib/__tests__/

# Run with verbose output
npm test -- --verbose

# Run with coverage for specific path
npm test -- --coverage --collectCoverageFrom="app/lib/**/*.ts"
```

## CI/CD

Tests run automatically on push/PR via GitHub Actions (`.github/workflows/ci.yml`).

The CI pipeline runs:
1. Lint & Type Check
2. Unit Tests
3. Integration Tests (with PostgreSQL)
4. E2E Tests (with Cypress)
5. Build Verification

## Documentation

- **[Testing Guide](docs/TESTING.md)**: Comprehensive testing guide with examples
- **[Testing Framework](docs/TESTING-FRAMEWORK.md)**: Architecture and configuration details
