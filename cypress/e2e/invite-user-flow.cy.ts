/**
 * E2E Test: Invite User Flow
 *
 * Tests inviting a user to an account
 */

describe("Invite User Flow", () => {
    beforeEach(() => {
        // Login as test user
        cy.login();
        cy.waitForNotifications();
    });

    it("should invite a user to the account", () => {
        const inviteEmail = `invite-${Date.now()}@example.com`;

        // Navigate to invitations page
        cy.visit("/dashboard/account/invitations");

        // Fill invitation form
        cy.get('input[name="email"]').type(inviteEmail);
        cy.get('select[name="roleId"]').select(1); // Select first role
        cy.get('button[type="submit"]').click();

        // Should show success message or redirect
        cy.contains("invitation", { matchCase: false }).should("be.visible");
    });

    it("should show error for duplicate invitation", () => {
        const inviteEmail = `duplicate-${Date.now()}@example.com`;

        cy.visit("/dashboard/account/invitations");

        // Create first invitation
        cy.get('input[name="email"]').type(inviteEmail);
        cy.get('select[name="roleId"]').select(1);
        cy.get('button[type="submit"]').click();

        // Try to create duplicate
        cy.get('input[name="email"]').clear().type(inviteEmail);
        cy.get('select[name="roleId"]').select(1);
        cy.get('button[type="submit"]').click();

        // Should show error
        cy.contains("already exists", { matchCase: false }).should(
            "be.visible"
        );
    });
});
