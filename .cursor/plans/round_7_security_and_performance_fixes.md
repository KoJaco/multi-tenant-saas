# Round 7: Security Risks and Code Quality Issues

## Security Issues

### 1. Race Condition in Invitation Creation

**Location**: `app/routes/_dash.dashboard.account.invitations.tsx:132-162`

When creating an invitation, the code checks if an invitation already exists, then inserts. If two requests come simultaneously, both checks could pass and both inserts could succeed (if no unique constraint) or one could fail with an unhandled error.

**Fix**: Wrap the check and insert in a transaction, or handle unique constraint violations gracefully:

```typescript
try {
    const [newInvitation] = await db
        .insert(userInvitations)
        .values({
            email: validatedData.email,
            roleId: validatedData.roleId,
            accountId: appUser.accountId,
            token,
            invitedBy: appUser.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: "pending",
        })
        .returning();

    return { success: true, invitation: newInvitation };
} catch (error: unknown) {
    if (isPostgresError(error) && error.code === "23505") {
        return createActionErrorResponse(
            "Invitation already exists for this email",
            409
        );
    }
    throw error;
}
```

**Note**: Need to import `isPostgresError` from `~/lib/auth/errors.server` or create a similar helper.

### 2. Race Condition in Permission-Role Assignment

**Location**: `app/routes/_dash.dashboard.account.roles.tsx:398-412`

When assigning a permission to a role, the code checks if the assignment already exists, then inserts. The `permissionRoles` table has a composite primary key on (roleId, permissionId), so duplicate inserts will fail with a constraint violation.

**Fix**: Handle unique constraint violation gracefully:

```typescript
try {
    await db.insert(permissionRoles).values({
        roleId: roleId as string,
        permissionId: permissionId as string,
    });

    return { success: true };
} catch (error: unknown) {
    if (isPostgresError(error) && error.code === "23505") {
        return createActionErrorResponse(
            "Permission is already assigned to this role",
            409
        );
    }
    throw error;
}
```

### 3. Race Condition in Role Creation

**Location**: `app/routes/_dash.dashboard.account.roles.tsx:156-178`

When creating a role, the code checks if a role with the same name exists, then inserts. There's a unique index on (name, accountId), so duplicate inserts will fail.

**Fix**: Handle unique constraint violation gracefully:

```typescript
try {
    const [newRole] = await db
        .insert(rolesTable)
        .values({
            name,
            description: description || "",
            accessLevel,
            accountId: appUser.accountId,
        })
        .returning();

    return { success: true, role: newRole };
} catch (error: unknown) {
    if (isPostgresError(error) && error.code === "23505") {
        return createActionErrorResponse("Role name already exists", 409);
    }
    throw error;
}
```

### 4. Race Condition in Permission Creation

**Location**: `app/routes/_dash.dashboard.account.permissions.tsx:121-147`

When creating a permission, the code checks if a permission with the same entity/actions exists for the account, then inserts. The unique index is on (entity, actions) without accountId, which means the same permission could exist across accounts but not within an account. However, concurrent requests could still cause issues.

**Fix**: Handle unique constraint violation gracefully (though the check includes accountId, so this is less likely but still possible):

```typescript
try {
    const [newPermission] = await db
        .insert(permissions)
        .values({
            entity: entity as EntityType,
            actions: actions as ActionType[],
            description: description || "",
            accountId: appUser.accountId,
            isCritical: false,
            isOwnerOnly: false,
        })
        .returning();

    return { success: true, permission: newPermission };
} catch (error: unknown) {
    if (isPostgresError(error) && error.code === "23505") {
        return createActionErrorResponse(
            "Permission for this entity already exists",
            409
        );
    }
    throw error;
}
```

### 5. Missing accountId Verification in Permission-Role Deletion

**Location**: `app/routes/_dash.dashboard.account.roles.tsx:475-482`

When deleting a permission-role assignment, the code verifies the role and permission belong to the account, but the deletion itself doesn't explicitly verify accountId. While the foreign keys should prevent cross-tenant deletions, this is a defense-in-depth issue.

**Fix**: Add accountId verification via join:

```typescript
await db
    .delete(permissionRoles)
    .innerJoin(roles, eq(permissionRoles.roleId, roles.id))
    .innerJoin(permissions, eq(permissionRoles.permissionId, permissions.id))
    .where(
        and(
            eq(permissionRoles.roleId, roleId as string),
            eq(permissionRoles.permissionId, permissionId as string),
            eq(roles.accountId, appUser.accountId),
            eq(permissions.accountId, appUser.accountId)
        )
    );
```

**Note**: Drizzle's delete with join syntax may need to be verified. Alternative: Use a subquery or verify via separate queries before deletion.

## Code Quality Issues

### 6. Inconsistent Error Response Format

**Location**: `app/routes/api.billing.credit-checkout.tsx:27`

Returns plain object `{ error: string, status: number }` instead of using `createErrorResponse` utility for consistency.

**Fix**: Use `createErrorResponse`:

```typescript
import { createErrorResponse } from "~/lib/errors.server";

if (!account) {
    return createErrorResponse(
        new Error("Account not found"),
        "Account not found",
        404
    );
}
```

### 7. Missing Error Handling for Unique Constraint Violations

**Locations**: Multiple insert operations after existence checks

While we check for existing records before inserting, concurrent requests could both pass the check and then one insert would fail with an unhandled constraint violation error.

**Fix**: Add try-catch blocks around all inserts that could have unique constraint violations, checking for PostgreSQL error code 23505 and returning user-friendly error messages.

**Note**: Need to create or import a helper function to check for PostgreSQL errors. Check if `isPostgresError` exists in `~/lib/auth/errors.server.ts` or create a similar utility.

## Implementation Order

1. Create/verify PostgreSQL error checking utility (if needed)
2. Fix race conditions with error handling (Critical - prevents unhandled errors)
3. Fix missing accountId verification in permission-role deletion (Defense-in-depth)
4. Standardize error handling in billing route (Consistency)
