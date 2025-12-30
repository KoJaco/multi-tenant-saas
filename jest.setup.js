/**
 * Jest Setup
 *
 * Global test setup and mocks
 */

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.SUPABASE_URL =
    process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || "test-anon-key";
process.env.SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY || "test-secret-key";
process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "test-session-secret-minimum-32-characters-long";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";

// Increase timeout for integration tests
jest.setTimeout(30000);
