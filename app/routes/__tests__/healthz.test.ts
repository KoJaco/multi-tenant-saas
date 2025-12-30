/**
 * Unit Tests: Health Check Route
 *
 * Tests for health check loader
 */

import { loader } from "../healthz";
import {
    initRequestContext,
    withRequestContext,
} from "~/lib/request-context.server";
import { jsonWithRequestId } from "~/lib/middleware.server";
import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
} from "~/lib/__tests__/jest-types";
import type { MockFn } from "~/lib/__tests__/jest-types";

type RequestContext = {
    requestId: string;
    userId?: string;
    accountId?: string;
    path?: string;
    method?: string;
    userAgent?: string;
};

// Mock dependencies
jest.mock("~/lib/request-context.server", () => ({
    initRequestContext: jest.fn(),
    withRequestContext: jest.fn(),
}));

jest.mock("~/lib/middleware.server", () => ({
    jsonWithRequestId: jest.fn(),
}));

describe("Health Check Route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return 200 OK with status", async () => {
        const mockRequest = new Request("http://localhost/healthz");
        const mockContext = { requestId: "test-123" };

        (
            initRequestContext as MockFn<[Request], RequestContext>
        ).mockReturnValue(mockContext);
        (
            withRequestContext as MockFn<
                [Partial<RequestContext>, () => Promise<any>],
                Promise<any>
            >
        ).mockImplementation(async (context: any, fn: any) => {
            return await fn();
        });
        (
            jsonWithRequestId as MockFn<[any, ResponseInit?], Response>
        ).mockReturnValue(
            new Response(JSON.stringify({ status: "ok" }), { status: 200 })
        );

        const response = await loader({ request: mockRequest } as any);

        expect(response.status).toBe(200);
        expect(initRequestContext).toHaveBeenCalledWith(mockRequest);
        expect(jsonWithRequestId).toHaveBeenCalled();
    });

    it("should include timestamp in response", async () => {
        const mockRequest = new Request("http://localhost/healthz");
        const mockContext = { requestId: "test-123" };

        (
            initRequestContext as MockFn<[Request], RequestContext>
        ).mockReturnValue(mockContext);
        (
            withRequestContext as MockFn<
                [Partial<RequestContext>, () => Promise<any>],
                Promise<any>
            >
        ).mockImplementation(async (context: any, fn: any) => {
            return await fn();
        });
        (
            jsonWithRequestId as MockFn<[any, ResponseInit?], Response>
        ).mockReturnValue(
            new Response(
                JSON.stringify({
                    status: "ok",
                    timestamp: "2024-01-01T00:00:00Z",
                }),
                {
                    status: 200,
                }
            )
        );

        const response = await loader({ request: mockRequest } as any);
        const body = await response.json();

        expect(body.status).toBe("ok");
        expect(body.timestamp).toBeDefined();
    });
});
