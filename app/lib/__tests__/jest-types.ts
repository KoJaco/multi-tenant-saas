/**
 * Jest Test Types
 *
 * Shared types for Jest mocks and test utilities
 */

import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
    afterEach,
} from "@jest/globals";
/**
 * Jest mock function type
 * Use this instead of jest.Mock for better type safety
 */
export type JestMock<T extends (...args: any[]) => any> = ReturnType<
    typeof jest.fn<T>
>;

/**
 * Mock function that can be typed with arguments and return value
 * Note: jest.Mock only accepts 0-1 type arguments, so we use ReturnType with a function signature
 */
export type MockFn<TArgs extends any[] = any[], TReturn = any> = ReturnType<
    typeof jest.fn<(...args: TArgs) => TReturn>
>;

/**
 * Re-export Jest globals for convenience
 */
export { jest, expect, describe, it, beforeEach, afterEach };
