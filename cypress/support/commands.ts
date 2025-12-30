/**
 * Cypress Custom Commands
 *
 * Custom commands for E2E tests
 */

/// <reference types="cypress" />

declare global {
    namespace Cypress {
        interface Chainable {
            /**
             * Login as a test user
             */
            login(email?: string, password?: string): Chainable<void>;

            /**
             * Logout current user
             */
            logout(): Chainable<void>;

            /**
             * Create a test account
             */
            createTestAccount(name: string): Chainable<void>;

            /**
             * Wait for notifications to load
             */
            waitForNotifications(): Chainable<void>;
        }
    }
}

Cypress.Commands.add("login", (email, password) => {
    const testEmail = email || Cypress.env("TEST_USER_EMAIL");
    const testPassword = password || Cypress.env("TEST_USER_PASSWORD");

    cy.visit("/login");
    cy.get('input[name="email"]').type(testEmail);
    cy.get('input[name="password"]').type(testPassword);
    cy.get('button[type="submit"]').click();
    cy.url().should("include", "/dashboard");
});

Cypress.Commands.add("logout", () => {
    cy.visit("/logout");
    cy.url().should("not.include", "/dashboard");
});

Cypress.Commands.add("createTestAccount", (name) => {
    cy.visit("/signup");
    cy.get('input[name="email"]').type(`test-${Date.now()}@example.com`);
    cy.get('input[name="password"]').type("test-password-123");
    cy.get('button[type="submit"]').click();
    // Wait for account creation
    cy.url().should("include", "/dashboard");
});

Cypress.Commands.add("waitForNotifications", () => {
    cy.intercept("GET", "/api/notifications*").as("getNotifications");
    cy.wait("@getNotifications");
});

export {};
