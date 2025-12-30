/**
 * Unit Tests: Error Handling
 *
 * 🟡 SHOULD HAVE - HIGH: Error handling tests
 * 
 * Tests for error classification and handling to ensure errors don't leak
 * sensitive information and are properly categorized.
 */

import {
    classifyError,
    serializeError,
    createErrorResponse,
} from "../errors.server";
import { getRequestId } from "../request-context.server";
import { jest, expect, describe, it } from "~/lib/__tests__/jest-types";

// Mock request context
jest.mock("~/lib/request-context.server", () => ({
    getRequestId: jest.fn(() => "test-request-id"),
    getRequestContext: jest.fn(() => undefined),
}));

describe("Error Handling", () => {
    describe("classifyError", () => {
        it("should classify validation errors as user errors", () => {
            const error = new Error("Invalid input");
            error.name = "ValidationError";

            const classification = classifyError(error);

            expect(classification).toBe("user");
        });

        it("should classify authentication errors as user errors", () => {
            const error = new Error("Unauthorized");
            error.name = "AuthError";

            const classification = classifyError(error);

            expect(classification).toBe("user");
        });

        it("should classify unknown errors as system errors", () => {
            const error = new Error("Something went wrong");

            const classification = classifyError(error);

            expect(classification).toBe("system");
        });
    });

    describe("serializeError", () => {
        it("should serialize Error objects", () => {
            const error = new Error("Test error");
            const result = serializeError(error);

            expect(result.message).toBe("Test error");
            expect(result.requestId).toBe("test-request-id");
        });

        it("should handle non-Error objects", () => {
            const error = "String error";
            const result = serializeError(error);

            expect(result.message).toBe("An unexpected error occurred.");
            expect(result.requestId).toBe("test-request-id");
        });
    });

    describe("createErrorResponse", () => {
        it("should create error response with status code", () => {
            const error = new Error("Test error");
            const response = createErrorResponse(error, "Custom message", 400);

            expect(response.status).toBe(400);
        });

        it("should use default status 500", () => {
            const error = new Error("Test error");
            const response = createErrorResponse(error);

            expect(response.status).toBe(500);
        });
    });
});
