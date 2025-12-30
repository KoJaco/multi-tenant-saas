# Contributing Guide

Guidelines for contributing to the multi-tenant SaaS template.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Adding New Features](#adding-new-features)

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Supabase)
- Git

### Initial Setup

1. **Fork and clone**:
   ```bash
   git clone <your-fork-url>
   cd multi-tenant
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Run migrations**:
   ```bash
   npm run migrate
   ```

5. **Apply RLS policies**:
   ```bash
   psql $DATABASE_URL -f scripts/apply-rls-policies.sql
   ```

6. **Start development server**:
   ```bash
   npm run dev
   ```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Enable strict mode (already configured)
- Use type inference where possible
- Avoid `any` type (use `unknown` if needed)

### React Router Patterns

- **Loaders**: Fetch data, return to component
- **Actions**: Handle mutations, redirect or return data
- **Components**: Presentational, use loader data

```typescript
// ✅ Good: Loader fetches data
export async function loader({ request }: LoaderFunctionArgs) {
    const { appUser } = await requireUser(request);
    const data = await fetchData(appUser.accountId);
    return json({ data });
}

// ✅ Good: Action handles mutation
export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    await updateData(formData);
    return redirect("/success");
}
```

### File Organization

```
app/
├── lib/
│   ├── adapters/       # Production adapters
│   ├── auth/           # Authentication utilities
│   ├── db/             # Database schema and migrations
│   └── ...             # Other utilities
├── routes/             # Route files
└── components/          # React components
```

### Naming Conventions

- **Files**: kebab-case (`user-management.tsx`)
- **Components**: PascalCase (`UserManagement`)
- **Functions**: camelCase (`getUserData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`UserData`)

### Code Formatting

- Use Prettier (configured in project)
- Run `npm run format` before committing
- Follow existing code style

## Testing

### Testing Multi-Tenant Features

When testing multi-tenant features:

1. **Test Tenant Isolation**:
   ```typescript
   // Create two test accounts
   const accountA = await createTestAccount();
   const accountB = await createTestAccount();
   
   // Create users in each account
   const userA = await createTestUser({ accountId: accountA.id });
   const userB = await createTestUser({ accountId: accountB.id });
   
   // Verify userA cannot access accountB's data
   const data = await fetchDataAsUser(userA.id);
   expect(data.every(item => item.accountId === accountA.id)).toBe(true);
   ```

2. **Test RLS Policies**:
   - Verify RLS policies are applied
   - Test that users can only access their account's data
   - Test that service role key bypasses RLS

3. **Test Permissions**:
   ```typescript
   // Create user with specific permissions
   const user = await createTestUser({ accountId });
   await assignRole(user.id, roleId);
   
   // Test permission checks
   const canCreate = await hasPermission(user.id, "users", "create");
   expect(canCreate).toBe(true);
   ```

### Mocking Adapters

Mock adapters in tests:

```typescript
import { setCacheAdapter, InMemoryCacheAdapter } from "~/lib/adapters/cache";

beforeEach(() => {
    setCacheAdapter(new InMemoryCacheAdapter());
});
```

## Pull Request Process

### Before Submitting

1. **Update Documentation**: Update relevant docs if adding features
2. **Add Tests**: Add tests for new functionality
3. **Check Linting**: Run `npm run typecheck`
4. **Test Locally**: Verify everything works

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No console.log statements (use logger)
- [ ] Environment variables documented
- [ ] Migration files included (if schema changes)
- [ ] RLS policies updated (if new tables)

### PR Description

Include:
- **What**: What changes were made
- **Why**: Why these changes were needed
- **How**: How to test the changes
- **Breaking Changes**: Any breaking changes

## Adding New Features

### Adding a New Route

1. **Create route file**:
   ```typescript
   // app/routes/my-feature.tsx
   export async function loader({ request }: LoaderFunctionArgs) {
       const { appUser } = await requireUser(request);
       // Fetch data
       return json({ data });
   }
   
   export default function MyFeature() {
       const { data } = useLoaderData<typeof loader>();
       return <div>{/* UI */}</div>;
   }
   ```

2. **Add to route structure** (if needed)
3. **Update API documentation**

### Adding a New Table

1. **Define schema**:
   ```typescript
   // app/lib/db/schema.ts
   export const myTable = pgTable("my_table", {
       id: uuid("id").primaryKey().defaultRandom(),
       accountId: uuid("account_id")
           .notNull()
           .references(() => accounts.id, { onDelete: "cascade" }),
       // ... fields
   }, (table) => ({
       accountIdIdx: index("my_table_account_id_idx").on(table.accountId),
   }));
   ```

2. **Generate migration**:
   ```bash
   npx drizzle-kit generate
   ```

3. **Add RLS policies**:
   Add to `scripts/apply-rls-policies.sql`

4. **Run migration**:
   ```bash
   npm run migrate
   ```

5. **Update documentation**:
   - Add to [Database Schema](DATABASE.md)
   - Update [Multi-Tenancy Guide](MULTI_TENANCY.md) if needed

### Adding a New Adapter

1. **Define interface**:
   ```typescript
   // app/lib/adapters/my-adapter.ts
   export interface MyAdapter {
       doSomething(): Promise<void>;
   }
   ```

2. **Implement adapters**:
   ```typescript
   export class InMemoryMyAdapter implements MyAdapter {
       async doSomething() {
           // Implementation
       }
   }
   
   export class RedisMyAdapter implements MyAdapter {
       constructor(private redis: any) {}
       
       async doSomething() {
           // Implementation
       }
   }
   ```

3. **Add to documentation**:
   - Update [Production Adapters](ADAPTERS.md)

### Adding Authentication Provider

1. **Configure in Supabase**: Enable provider in Supabase Dashboard
2. **Add route**: Create `_auth.social.tsx` route (if needed)
3. **Update documentation**: Add to [Authentication Guide](AUTH.md)

## Code Review Guidelines

### For Reviewers

- Be constructive and respectful
- Focus on code quality and correctness
- Check for security issues
- Verify multi-tenant isolation
- Ensure documentation is updated

### For Authors

- Respond to feedback promptly
- Make requested changes
- Ask questions if unclear
- Update PR based on feedback

## Security Considerations

### Never Commit Secrets

- Never commit `.env` files
- Never commit API keys or secrets
- Use `.env.example` for documentation

### Multi-Tenant Security

- Always filter by `accountId`
- Test tenant isolation
- Verify RLS policies
- Check permissions before operations

### Input Validation

- Always validate inputs with Zod
- Sanitize user input
- Use parameterized queries (Drizzle does this)

## Documentation

### Updating Documentation

When adding features:

1. **Update relevant docs**: Add to appropriate guide
2. **Add code examples**: Include usage examples
3. **Update API reference**: If adding routes/endpoints
4. **Update diagrams**: If architecture changes

### Documentation Style

- Clear and concise
- Include code examples
- Link between documents
- Keep diagrams simple

## Questions?

- Check existing documentation
- Review code examples
- Ask in discussions/issues

## Next Steps

- **[Quick Start](QUICK_START.md)**: Get started
- **[Architecture](ARCHITECTURE.md)**: Understand the system
- **[Multi-Tenancy Guide](MULTI_TENANCY.md)**: Multi-tenant patterns

