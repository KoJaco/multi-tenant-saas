import {
    type RouteConfig,
    route,
    index,
    layout,
} from "@react-router/dev/routes";

export default [
    // Marketing layout with all marketing routes
    layout("routes/_mkt.tsx", [index("routes/_mkt._index.tsx")]),

    layout("routes/_mkt._policies.tsx", [
        route(
            "policies/terms-of-service",
            "routes/_mkt.policies.terms-of-service.tsx"
        ),
        route(
            "policies/privacy-policy",
            "routes/_mkt.policies.privacy-policy.tsx"
        ),
    ]),

    layout("routes/_auth.tsx", [
        route("/auth/forgot-password", "routes/_auth.forgot-password.tsx"),
        route("/auth/password-recovery", "routes/_auth.password-recovery.tsx"),
        route("/auth/error", "routes/_auth.error.tsx"),
        route("/auth/verify-email", "routes/_auth.verify-email.tsx"),
        route("/auth/signup-success", "routes/_auth.signup-success.tsx"),
        route("/auth/reset-password", "routes/_auth.reset-password.tsx"),
        route("/auth/verify-otp", "routes/_auth.verify-otp.tsx"),
        route(
            "/auth/resend-confirmation",
            "routes/_auth.resend-confirmation.tsx"
        ),
        route("/auth/accept-invitation", "routes/_auth.accept-invitation.tsx"),
        route("/auth/setup-password", "routes/_auth.setup-password.tsx"),
        route("/auth/setup-mfa", "routes/_auth.setup-mfa.tsx"),
        route("/auth/verify-mfa", "routes/_auth.verify-mfa.tsx"),

        // sign-in / up flow
        route("/login", "routes/_auth.login.tsx"),
        route("/signup", "routes/_auth.signup.tsx"),
        route("/logout", "routes/_auth.logout.tsx"),
    ]),

    // Auth routes without layout (loader/action only)
    route("/auth/social", "routes/_auth.social.tsx"),
    route("/auth/confirm", "routes/_auth.confirm.tsx"),
    route("/auth/callback", "routes/_auth.callback.tsx"),

    // Dashboard layout with all dashboard routes
    layout("routes/_dash.tsx", [
        route("dashboard", "routes/_dash.dashboard._index.tsx"),
        layout("routes/_dash._acc.tsx", [
            route(
                "dashboard/account",
                "routes/_dash.dashboard.account._index.tsx"
            ),
            route(
                "dashboard/account/settings",
                "routes/_dash.dashboard.account.settings.tsx"
            ),
            route("dashboard/settings", "routes/_dash.dashboard.settings.tsx"),
            route(
                "dashboard/settings/security",
                "routes/_dash.dashboard.settings.security.tsx"
            ),
            route(
                "dashboard/account/users",
                "routes/_dash.dashboard.account.users.tsx"
            ),
            route(
                "dashboard/account/users/:userId/manage",
                "routes/_dash.dashboard.account.users.$userId.manage.tsx"
            ),
            route(
                "dashboard/account/roles",
                "routes/_dash.dashboard.account.roles.tsx"
            ),
            route(
                "dashboard/account/roles/:roleId/manage",
                "routes/_dash.dashboard.account.roles.$roleId.manage.tsx"
            ),
            route(
                "dashboard/account/permissions",
                "routes/_dash.dashboard.account.permissions.tsx"
            ),
            route(
                "dashboard/account/invitations",
                "routes/_dash.dashboard.account.invitations.tsx"
            ),
            route(
                "dashboard/account/billings",
                "routes/_dash.dashboard.account.billings.tsx"
            ),
            route(
                "dashboard/account/ownership",
                "routes/_dash.dashboard.account.ownership.tsx"
            ),
            route(
                "dashboard/account/notifications",
                "routes/_dash.dashboard.account.notifications.tsx"
            ),
            route(
                "dashboard/account/audit-logs",
                "routes/_dash.dashboard.account.audit-logs.tsx"
            ),
            route("dashboard/profile", "routes/_dash.dashboard.profile.tsx"),
        ]),
    ]),

    // Action routes (no layout)
    route("action/set-theme", "routes/action.set-theme.ts"),

    // API routes
    route("api/notifications", "routes/api.notifications.tsx"),

    // Root route redirects to marketing home
    index("routes/index.tsx"),

    // 403 error route
    route("403", "routes/403.tsx"),

    // Health check routes
    route("healthz", "routes/healthz.tsx"),
    route("readyz", "routes/readyz.tsx"),

    // Metrics endpoint
    route("metrics", "routes/metrics.tsx"),

    // Webhook routes
    route("webhooks/stripe", "routes/webhooks.stripe.tsx"),
    route("webhooks/app/*", "routes/webhooks.app.$.tsx"),
] satisfies RouteConfig;
