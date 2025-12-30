/**
 * Integration Tests: Notifications API
 *
 * Tests for notifications API route with mocked database and auth
 */

import { loader, action } from "../api.notifications";
import { requireUser } from "~/lib/auth/auth.server";
import {
    getUserNotifications,
    markNotificationRead,
} from "~/lib/notifications/server";
import {
    createMockRequest,
    createMockFormData,
    createMockAppUser,
} from "~/lib/__tests__/setup";
import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
} from "~/lib/__tests__/jest-types";
import type { MockFn } from "~/lib/__tests__/jest-types";

// Mock auth
jest.mock("~/lib/auth/auth.server", () => ({
    requireUser: jest.fn(),
}));

// Mock notification service
jest.mock("~/lib/notifications/server", () => ({
    getUserNotifications: jest.fn(),
    getUnreadNotificationCount: jest.fn(),
    markNotificationRead: jest.fn(),
    markNotificationUnread: jest.fn(),
    markAllNotificationsRead: jest.fn(),
    deleteNotification: jest.fn(),
    createNotification: jest.fn(),
}));

// Mock request context
jest.mock("~/lib/request-context.server", () => ({
    initRequestContext: jest.fn((req: Request) => ({
        requestId: "test-123",
        path: new URL(req.url).pathname,
        method: req.method,
    })),
    withRequestContext: jest.fn(
        async (context: any, fn: () => Promise<any>) => await fn()
    ),
}));

describe("Notifications API Integration Tests", () => {
    const mockUser = createMockAppUser();

    beforeEach(() => {
        jest.clearAllMocks();
        (
            requireUser as unknown as MockFn<
                [any],
                Promise<{ appUser: typeof mockUser }>
            >
        ).mockResolvedValue({ appUser: mockUser });
    });

    describe("GET /api/notifications", () => {
        it("should return notifications for user", async () => {
            const mockNotifications = [
                {
                    id: "notif-1",
                    type: "info",
                    title: "Test",
                    message: "Test message",
                    read: false,
                    createdAt: new Date().toISOString(),
                },
            ];

            (
                getUserNotifications as unknown as MockFn<
                    [any],
                    Promise<typeof mockNotifications>
                >
            ).mockResolvedValue(mockNotifications);

            const request = createMockRequest(
                "http://localhost/api/notifications"
            );
            const response = await loader({ request } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.notifications).toEqual(mockNotifications);
            expect(getUserNotifications).toHaveBeenCalledWith({
                accountId: mockUser.accountId,
                userId: mockUser.id,
            });
        });

        it("should filter by read status", async () => {
            const request = createMockRequest(
                "http://localhost/api/notifications?read=false"
            );

            await loader({ request } as any);

            expect(getUserNotifications).toHaveBeenCalledWith(
                expect.objectContaining({
                    read: false,
                })
            );
        });

        it("should return unread count when intent=count", async () => {
            const { getUnreadNotificationCount } = await import(
                "~/lib/notifications/server"
            );
            (
                getUnreadNotificationCount as MockFn<
                    [any, any],
                    Promise<number>
                >
            ).mockResolvedValue(5);

            const request = createMockRequest(
                "http://localhost/api/notifications?intent=count"
            );
            const response = await loader({ request } as any);
            const data = await response.json();

            expect(data.count).toBe(5);
        });
    });

    describe("POST /api/notifications", () => {
        it("should mark notification as read", async () => {
            const formData = createMockFormData({
                intent: "mark-read",
                notificationId: "notif-123",
            });

            const request = createMockRequest(
                "http://localhost/api/notifications",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const response = await action({ request } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(markNotificationRead).toHaveBeenCalledWith(
                "notif-123",
                mockUser.id
            );
        });

        it("should mark all notifications as read", async () => {
            const { markAllNotificationsRead } = await import(
                "~/lib/notifications/server"
            );
            (
                markAllNotificationsRead as MockFn<[any, any], Promise<number>>
            ).mockResolvedValue(5);

            const formData = createMockFormData({
                intent: "mark-all-read",
            });

            const request = createMockRequest(
                "http://localhost/api/notifications",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const response = await action({ request } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.count).toBe(5);
        });
    });
});
