/**
 * Cypress E2E Test Configuration
 *
 * End-to-end testing configuration with Cypress
 */

import { defineConfig } from "cypress";

export default defineConfig({
    e2e: {
        baseUrl: "http://localhost:5173",
        setupNodeEvents(on, config) {
            // implement node event listeners here
        },
        viewportWidth: 1280,
        viewportHeight: 720,
        video: false,
        screenshotOnRunFailure: true,
        defaultCommandTimeout: 10000,
        requestTimeout: 10000,
        responseTimeout: 10000,
        env: {
            // Test user credentials (should be set in CI)
            TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || "test@example.com",
            TEST_USER_PASSWORD:
                process.env.TEST_USER_PASSWORD || "test-password-123",
        },
    },
    component: {
        devServer: {
            framework: "react",
            bundler: "vite",
        },
    },
});
