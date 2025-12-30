/**
 * Unit Tests: Notification Service
 *
 * 🟡 SHOULD HAVE - MEDIUM: Notifications tests
 * 
 * Tests for notification system to ensure notifications are created correctly
 * and respect account boundaries.
 */

import {
    createUserNotification,
    createRoleBasedNotification,
    getUnreadNotificationCount,
    markNotificationRead,
} from "../notifications/server";
import { db } from "~/lib/db/index.server";
import { notifications } from "~/lib/db/schema";
import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
} from "~/lib/__tests__/jest-types";
import type { MockFn } from "~/lib/__tests__/jest-types";
// Mock database
jest.mock("~/lib/db/index.server", () => ({
    db: {
        insert: jest.fn(),
        query: {
            notifications: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            roleUsers: {
                findMany: jest.fn(),
            },
            users: {
                findMany: jest.fn(),
            },
        },
        update: jest.fn(),
        delete: jest.fn(),
        select: jest.fn(),
    },
}));

// Mock logger
jest.mock("~/lib/logging.server", () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe("Notification Service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createUserNotification", () => {
        it("should create a notification for a specific user", async () => {
            const mockReturning = jest
                .fn<() => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([{ id: "notification-123" }]);
            const mockValues = jest
                .fn<() => { returning: typeof mockReturning }>()
                .mockReturnValue({
                    returning: mockReturning,
                });
            const mockInsert = jest
                .fn<() => { values: typeof mockValues }>()
                .mockReturnValue({
                    values: mockValues,
                });

            (
                db.insert as unknown as MockFn<
                    [typeof notifications],
                    { values: typeof mockValues }
                >
            ).mockReturnValue({
                values: mockValues,
            });

            const result = await createUserNotification({
                accountId: "account-123",
                userId: "user-456",
                type: "info",
                title: "Test Notification",
                message: "This is a test",
            });

            expect(result).toBe("notification-123");
            expect(db.insert).toHaveBeenCalledWith(notifications);
        });

        it("should throw error if userId is missing", async () => {
            await expect(
                createUserNotification({
                    accountId: "account-123",
                    type: "info",
                    title: "Test",
                    message: "Test",
                } as any)
            ).rejects.toThrow("userId is required");
        });
    });

    describe("createRoleBasedNotification", () => {
        it("should create notifications for users with specified roles", async () => {
            const mockRoleUsers = [{ userId: "user-1" }, { userId: "user-2" }];

            (
                db.query.roleUsers.findMany as unknown as MockFn<
                    [],
                    Promise<typeof mockRoleUsers>
                >
            ).mockResolvedValue(mockRoleUsers);

            const mockReturning = jest
                .fn<() => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([
                    { id: "notification-1" },
                    { id: "notification-2" },
                ]);
            const mockValues = jest
                .fn<() => { returning: typeof mockReturning }>()
                .mockReturnValue({
                    returning: mockReturning,
                });

            (
                db.insert as unknown as MockFn<
                    [typeof notifications],
                    { values: typeof mockValues }
                >
            ).mockReturnValue({
                values: mockValues,
            });

            const result = await createRoleBasedNotification({
                accountId: "account-123",
                roleIds: ["role-1"],
                type: "info",
                title: "Test Notification",
                message: "This is a test",
            });

            expect(result).toHaveLength(2);
            expect(result).toEqual(["notification-1", "notification-2"]);
        });

        it("should throw error if roleIds is missing", async () => {
            await expect(
                createRoleBasedNotification({
                    accountId: "account-123",
                    type: "info",
                    title: "Test",
                    message: "Test",
                } as any)
            ).rejects.toThrow("roleIds is required");
        });
    });

    describe("getUnreadNotificationCount", () => {
        it("should return count of unread notifications", async () => {
            const mockWhere = jest
                .fn<() => Promise<Array<{ count: number }>>>()
                .mockResolvedValue([{ count: 5 }]);
            const mockFrom = jest
                .fn<() => { where: typeof mockWhere }>()
                .mockReturnValue({
                    where: mockWhere,
                });
            const mockSelect = jest
                .fn<() => { from: typeof mockFrom }>()
                .mockReturnValue({
                    from: mockFrom,
                });

            (
                db.select as unknown as MockFn<[], { from: typeof mockFrom }>
            ).mockReturnValue({
                from: mockFrom,
            });

            const count = await getUnreadNotificationCount(
                "account-123",
                "user-456"
            );

            expect(count).toBe(5);
        });
    });

    describe("markNotificationRead", () => {
        it("should mark notification as read", async () => {
            const mockWhere = jest
                .fn<() => Promise<void>>()
                .mockResolvedValue(undefined);
            const mockSet = jest
                .fn<() => { where: typeof mockWhere }>()
                .mockReturnValue({
                    where: mockWhere,
                });

            (
                db.update as unknown as MockFn<
                    [typeof notifications],
                    { set: typeof mockSet }
                >
            ).mockReturnValue({
                set: mockSet,
            });

            await markNotificationRead("notification-123", "user-456", "account-123");

            expect(db.update).toHaveBeenCalledWith(notifications);
        });
    });
});
