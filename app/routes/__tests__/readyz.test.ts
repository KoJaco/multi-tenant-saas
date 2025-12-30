/**
 * Integration Test: Readiness Check
 *
 * Tests readiness endpoint with mocked dependencies
 */

import { loader } from "../readyz";
import { db } from "~/lib/db/index.server";
import {
    jest,
    expect,
    describe,
    it,
    beforeEach,
} from "~/lib/__tests__/jest-types";

// Mock database
const mockExecute = jest.fn<() => Promise<any>>();
jest.mock("~/lib/db/index.server", () => ({
    db: {
        execute: mockExecute,
    },
}));

// Mock config
jest.mock("~/lib/config.server", () => ({
    serverConfig: {
        STRIPE_SECRET_KEY: "sk_test_123",
        REDIS_URL: "redis://localhost:6379",
    },
}));

// Mock Stripe
jest.mock("stripe", () => {
    return jest.fn().mockImplementation(() => ({
        customers: {
            list: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({
                data: [],
            }),
        },
    }));
});

// Mock Redis
jest.mock("ioredis", () => {
    return jest.fn().mockImplementation(() => ({
        ping: jest.fn<() => Promise<string>>().mockResolvedValue("PONG"),
        quit: jest.fn<() => Promise<string>>().mockResolvedValue("OK"),
    }));
});

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

describe("Readiness Check Integration Test", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return 200 when all checks pass", async () => {
        mockExecute.mockResolvedValue(undefined);

        const request = new Request("http://localhost/readyz");
        const response = await loader({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe("ok");
        expect(data.checks.database).toBe(true);
    });

    it("should return 503 when database check fails", async () => {
        mockExecute.mockRejectedValue(new Error("Connection failed"));

        const request = new Request("http://localhost/readyz");
        const response = await loader({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.status).toBe("degraded");
        expect(data.checks.database).toBe(false);
    });
});
