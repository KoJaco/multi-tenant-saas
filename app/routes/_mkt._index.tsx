import {
    Link,
    useLoaderData,
    redirect,
    type LoaderFunctionArgs,
    type MetaFunction,
} from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { MarketingLayout } from "~/components/marketing/01/marketing-layout";
import type { MarketingLayoutConfig } from "~/components/marketing/types";

export const meta: MetaFunction = () => {
    return [
        { title: "Multi-tenant SaaS Template | Production-ready" },
        {
            name: "description",
            content:
                "Multi-tenant SaaS Template is a production-ready template for building multi-tenant SaaS applications with React Router. This template provides everything you need to quickly launch a SaaS product: comprehensive marketing site, full-featured dashboard, authentication, role-based access control (RBAC), and Stripe integration. ",
        },
    ];
};

export async function loader({ request }: LoaderFunctionArgs) {
    const { getCurrentUser } = await import("~/lib/auth/auth.server");
    const url = new URL(request.url);
    
    // Handle legacy password reset links that land on root with ?code=
    const code = url.searchParams.get("code");
    if (code) {
        // Redirect to OAuth callback (most likely case) or password recovery
        // Since we can't distinguish the code type, try OAuth callback first
        return redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=/dashboard`);
    }
    
    const { user, headers } = await getCurrentUser(request);

    return { authUser: user?.authUser || null, headers };
}

const MARKETING_CONFIG: MarketingLayoutConfig = {
    navigation: [
        { id: "hero", title: "hero" },
        { id: "features", title: "features" },
        { id: "security", title: "security" },
        { id: "tech-stack", title: "tech stack" },
        { id: "getting-started", title: "getting started" },
        { id: "cta", title: "get started" },
    ],
    brandName: "Multi-Tenant SaaS Template",
    brandTagline: (
        <>
            Production-ready <br />
            multi-tenant SaaS template
        </>
    ),
    sections: {
        hero: {
            id: "hero",
            title: <span>Multi-Tenant SaaS Template — Launch Faster</span>,
            eyebrow: <p>Production-ready foundation</p>,
            body: (
                <div className="space-y-6">
                    <p className="text-foreground/50">
                        A production-ready template for building multi-tenant
                        SaaS applications with React Router. Everything you need
                        to quickly launch: comprehensive marketing site,
                        full-featured dashboard, authentication, role-based
                        access control (RBAC), and Stripe integration. Built
                        with modern tools and best practices.
                    </p>
                    <span className="text-sm text-foreground/50">
                        Start building your SaaS in minutes, not months
                    </span>
                    <div className="min-h-[300px] rounded-lg bg-card shadow flex items-center justify-center border">
                        <p className="text-foreground/40 text-sm">
                            Dashboard preview placeholder
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button asChild>
                            <Link to="/signup" className="group">
                                Get started
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link to="#getting-started">View docs</Link>
                        </Button>
                    </div>
                </div>
            ),
        },

        features: {
            id: "features",
            title: (
                <p>
                    Everything you need to{" "}
                    <span className="text-primary">launch fast</span>
                </p>
            ),
            eyebrow: "Core Features",
            body: (
                <div className="grid gap-4 sm:grid-cols-2">
                    {[
                        {
                            h: "Multi-Tenant Architecture",
                            p: "Shared database, shared schema with accountId isolation and Row-Level Security (RLS) policies for complete tenant data isolation.",
                        },
                        {
                            h: "Authentication System",
                            p: "Complete auth with Supabase: email/password, OAuth providers, password reset, email verification, and secure session management.",
                        },
                        {
                            h: "Role-Based Access Control",
                            p: "Flexible RBAC with roles, permissions, and access levels. Manage team members with granular permissions and hierarchical access control.",
                        },
                        {
                            h: "Stripe Integration",
                            p: "Full subscription management, webhooks, credit system, and billing dashboard. Ready for production payment processing.",
                        },
                        {
                            h: "Marketing Site",
                            p: "Production-ready landing page with sections, pricing tables, and policy pages. Fully customizable marketing components.",
                        },
                        {
                            h: "Dashboard & Management",
                            p: "Full-featured dashboard with account management, user management, role/permission configuration, billing, and notifications.",
                        },
                    ].map((item, i) => (
                        <Card key={i} className="shadow rounded-2xl border">
                            <CardContent>
                                <div className="text-sm font-medium text-foreground">
                                    {item.h}
                                </div>
                                <p className="mt-2 text-sm text-foreground/50">
                                    {item.p}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ),
        },

        security: {
            id: "security",
            title: "Security & Production Features",
            eyebrow: "Built for scale",
            body: (
                <div className="grid gap-4 md:grid-cols-2">
                    {[
                        {
                            h: "CSRF Protection",
                            p: "Built-in CSRF token validation for all forms. Protect against cross-site request forgery attacks with automatic token generation and validation.",
                        },
                        {
                            h: "Rate Limiting",
                            p: "Configurable rate limiting with in-memory and Redis adapters. Prevent abuse and ensure fair resource usage across tenants.",
                        },
                        {
                            h: "Row-Level Security",
                            p: "Database-level tenant isolation via Supabase RLS policies. Enforce data access at the database layer for defense-in-depth security.",
                        },
                        {
                            h: "Input Validation",
                            p: "Zod schemas for all form inputs. Type-safe validation on both client and server with clear error messages.",
                        },
                        {
                            h: "Secure Sessions",
                            p: "HttpOnly cookies with secure session management. Protect user sessions from XSS attacks with industry-standard practices.",
                        },
                        {
                            h: "Error Handling",
                            p: "Standardized error responses and user-friendly error messages. Consistent error handling across the entire application.",
                        },
                    ].map((f, i) => (
                        <Card key={i} className="shadow rounded-2xl border">
                            <CardContent>
                                <div className="text-sm font-medium text-foreground">
                                    {f.h}
                                </div>
                                <p className="mt-2 text-sm text-foreground/50">
                                    {f.p}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ),
        },

        "tech-stack": {
            id: "tech-stack",
            title: "Modern Tech Stack",
            eyebrow: (
                <div className="flex flex-col items-start justify-between gap-y-4 mb-6">
                    <Badge className="text-sm rounded-full px-4">
                        React Router → Supabase → Drizzle → Stripe
                    </Badge>
                    <span>
                        Built with production-ready tools and best practices.
                    </span>
                </div>
            ),
            body: (
                <div className="text-foreground/60 space-y-4">
                    <ol className="list-decimal pl-5 space-y-3">
                        <li>
                            <span className="text-foreground/80">
                                React Router v7
                            </span>{" "}
                            — Full-stack React framework with server-side
                            rendering, data loading, and type-safe routing.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Supabase Auth
                            </span>{" "}
                            — Complete authentication system with email, OAuth,
                            and secure session management.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Drizzle ORM
                            </span>{" "}
                            — Type-safe database queries with PostgreSQL. Full
                            TypeScript support and excellent developer
                            experience.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Stripe Integration
                            </span>{" "}
                            — Production-ready payment processing with
                            subscriptions, webhooks, and billing management.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Tailwind CSS + Radix UI
                            </span>{" "}
                            — Beautiful, accessible UI components with
                            customizable design system.
                        </li>
                    </ol>
                </div>
            ),
        },

        "getting-started": {
            id: "getting-started",
            title: "Get Started in Minutes",
            eyebrow: "Quick setup",
            body: (
                <div className="text-foreground/60 space-y-4">
                    <ol className="list-decimal pl-5 space-y-3">
                        <li>
                            <span className="text-foreground/80">
                                Clone & Install
                            </span>{" "}
                            — Clone the repository and install dependencies with
                            npm or yarn.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Configure Environment
                            </span>{" "}
                            — Set up your Supabase project, database connection,
                            and Stripe keys.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Run Migrations
                            </span>{" "}
                            — Apply database migrations to set up the schema and
                            RLS policies.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Create Superuser
                            </span>{" "}
                            — Set up your first admin account with the provided
                            script.
                        </li>
                        <li>
                            <span className="text-foreground/80">
                                Start Building
                            </span>{" "}
                            — Launch the dev server and start customizing for
                            your SaaS product.
                        </li>
                    </ol>
                    <div className="mt-6 p-4 bg-card rounded-lg border">
                        <p className="text-sm text-foreground/70 mb-2">
                            <strong>Comprehensive Documentation:</strong>
                        </p>
                        <ul className="text-sm text-foreground/60 space-y-1 list-disc list-inside">
                            <li>Architecture & Multi-Tenancy Guide</li>
                            <li>Authentication & Authorization</li>
                            <li>Database Schema & Migrations</li>
                            <li>Stripe Integration Setup</li>
                            <li>Deployment Guide</li>
                        </ul>
                    </div>
                </div>
            ),
        },

        cta: {
            id: "cta",
            title: (
                <span>
                    Start building your{" "}
                    <span className="text-primary">SaaS product</span> today
                </span>
            ),
            eyebrow: "Ready to launch?",
            body: (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Button asChild size="lg">
                        <Link to="/signup" className="group">
                            Get started
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                        <Link to="/login">Sign in</Link>
                    </Button>
                </div>
            ),
        },
    },
};

export default function Index() {
    const { authUser } = useLoaderData<typeof loader>();

    return <MarketingLayout config={MARKETING_CONFIG} authUser={authUser} />;
}
