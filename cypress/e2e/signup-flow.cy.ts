/**
 * E2E Test: Sign Up Flow
 *
 * Tests the complete signup flow including account creation
 */

describe("Sign Up Flow", () => {
    beforeEach(() => {
        // Clear any existing session
        cy.clearCookies();
        cy.clearLocalStorage();
    });

    it("should complete signup and create account", () => {
        const timestamp = Date.now();
        const testEmail = `test-${timestamp}@example.com`;
        const testPassword = "TestPassword123!";

        // Visit signup page
        cy.visit("/signup");

        // Fill signup form
        cy.get('input[name="email"]').type(testEmail);
        cy.get('input[name="password"]').type(testPassword);
        cy.get('button[type="submit"]').click();

        // Should redirect to email verification or dashboard
        cy.url().should("satisfy", (url) => {
            return (
                url.includes("/auth/verify-email") || url.includes("/dashboard")
            );
        });
    });

    it("should show validation errors for invalid input", () => {
        cy.visit("/signup");

        // Try to submit empty form
        cy.get('button[type="submit"]').click();

        // Should show validation errors
        cy.contains("required", { matchCase: false }).should("be.visible");
    });
});
