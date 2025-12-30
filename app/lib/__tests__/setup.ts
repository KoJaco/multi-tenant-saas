/**
 * Test Setup Utilities
 *
 * Common utilities for setting up test environments
 */

import type { AppUser } from "~/lib/db/types";

/**
 * Create a mock request
 */
export function createMockRequest(
    url: string = "http://localhost",
    options?: RequestInit
): Request {
    return new Request(url, options);
}

/**
 * Create mock form data
 */
export function createMockFormData(data: Record<string, string>): FormData {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
    });
    return formData;
}

/**
 * Create mock app user
 */
export function createMockAppUser(overrides?: Partial<AppUser>): AppUser {
    return {
        id: "user-123",
        email: "test@example.com",
        provider: "email",
        providerId: null,
        role: "user",
        accountId: "account-123",
        emailVerified: false,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
    };
}

/**
 * Mock database query result
 *
 * Note: This function should only be used in test files where jest is available.
 * In test files, import jest from @jest/globals and pass it as the second parameter:
 * ```ts
 * import { jest } from "@jest/globals";
 * const mock = mockDbQuery(data, jest);
 * ```
 */
export function mockDbQuery<T>(
    data: T | T[],
    jestFn: {
        fn: () => {
            mockResolvedValue: (value: T | T[]) => any;
        };
    }
) {
    return {
        findFirst: jestFn
            .fn()
            .mockResolvedValue(Array.isArray(data) ? data[0] : data),
        findMany: jestFn
            .fn()
            .mockResolvedValue(Array.isArray(data) ? data : [data]),
    };
}
