/**
 * Database Mock Utilities
 *
 * Utilities for mocking database in tests
 */

import { jest } from "@jest/globals";
import type { JestMock } from "./jest-types";

/**
 * Mock query methods for a table
 */
type MockTableQuery = {
    findFirst: JestMock<() => Promise<any>>;
    findMany: JestMock<() => Promise<any>>;
};

/**
 * Mock database query object
 */
type MockDbQuery = {
    accounts: MockTableQuery;
    users: MockTableQuery;
    notifications: MockTableQuery;
    roleUsers: MockTableQuery;
    roles: MockTableQuery;
    [key: string]: MockTableQuery;
};

/**
 * Mock database instance type
 * Represents a mocked Drizzle database with Jest mock functions
 */
export type MockDatabase = {
    insert: JestMock<() => Promise<any>>;
    select: JestMock<() => Promise<any>>;
    update: JestMock<() => Promise<any>>;
    delete: JestMock<() => Promise<any>>;
    query: MockDbQuery;
    execute: JestMock<() => Promise<any>>;
    transaction: JestMock<() => Promise<any>>;
};

/**
 * Create a mock database instance
 * Returns a mock database object for use in tests
 */
export function createMockDb(): MockDatabase {
    return {
        insert: jest.fn(),
        select: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        query: {
            accounts: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            users: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            notifications: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            roleUsers: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            roles: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
        },
        execute: jest.fn(),
        transaction: jest.fn(),
    };
}
