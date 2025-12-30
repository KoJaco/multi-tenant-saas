import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
    useRouteError,
    type LoaderFunctionArgs,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { themeSessionResolver } from "./resources/sessions.server";
import {
    PreventFlashOnWrongTheme,
    ThemeProvider,
    useTheme,
} from "remix-themes";
import { TopLoader } from "./components/ui/top-loader";
import { Toaster } from "./components/ui/toaster";
import { publicConfig, isProduction } from "~/lib/config.server";
import { ErrorBoundary as ErrorBoundaryComponent } from "./components/errors/ErrorBoundary";
import { CatchBoundary as CatchBoundaryComponent } from "./components/errors/CatchBoundary";

export const links: Route.LinksFunction = () => [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
    },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
    },
];

export async function loader({ request }: LoaderFunctionArgs) {
    // Allows us to attach a requestID to the request and propogate through logs, webhooks, etc.
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");

    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        const { getTheme } = await themeSessionResolver(request);
        return {
            theme: getTheme(),
            env: publicConfig, // Now validated and type-safe
        };
    });
}

export function headers() {
    // Contenty Security Policy
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://resend.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://resend.com",
        "frame-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
    ].join("; ");

    return {
        "Content-Security-Policy": csp,
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        ...(isProduction && {
            "Strict-Transport-Security":
                "max-age=63072000; includeSubDomains; preload",
        }),
    };
}

export default function AppWithProviders() {
    const { theme, env } = useLoaderData<typeof loader>();

    return (
        <ThemeProvider
            specifiedTheme={theme}
            themeAction="/action/set-theme"
            disableTransitionOnThemeChange={true}
        >
            <App env={env} />
        </ThemeProvider>
    );
}

export function App({
    env,
}: {
    env: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string };
}) {
    const [theme] = useTheme();

    return (
        <html lang="en" className={theme ?? "scroll-smooth"}>
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <PreventFlashOnWrongTheme ssrTheme={Boolean(theme)} />
                <Links />
            </head>
            <body className="h-full bg-background text-foreground">
                <TopLoader />
                <Outlet />
                <ScrollRestoration />
                <Scripts />
                <Toaster />
            </body>
        </html>
    );
}

// CatchBoundary handles HTTP errors (4xx, redirects)
export function CatchBoundary() {
    return <CatchBoundaryComponent />;
}

// ErrorBoundary handles unexpected errors (500)
export function ErrorBoundary({ error }: { error: unknown }) {
    const errorId = `server-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Note: Server-side error logging is handled in ErrorBoundaryComponent
    // Cannot import .server files here as ErrorBoundary runs on both client and server

    return <ErrorBoundaryComponent errorId={errorId} />;
}
