/**
 * Error Boundary Component
 *
 * Catches unexpected errors (500) that occur during rendering.
 * Separate from CatchBoundary which handles HTTP errors.
 */

import { useRouteError } from "react-router";
import { ErrorPage } from "./ErrorPage";

interface ErrorBoundaryProps {
    errorId?: string;
}

export function ErrorBoundary({ errorId: serverErrorId }: ErrorBoundaryProps) {
    const error = useRouteError();
    const isDevelopment = import.meta.env.DEV;
    // Use server-provided error ID or generate a client-side one
    const errorId =
        serverErrorId ||
        `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Note: Server-side error logging cannot be done here as components cannot import .server files
    // Errors should be logged where they occur (in loaders/actions) or via a separate API endpoint

    // In development, show more details
    if (isDevelopment && error instanceof Error) {
        return (
            <div className="min-h-screen p-8 bg-background">
                <div className="max-w-4xl mx-auto">
                    <ErrorPage
                        title="Application Error"
                        message={error.message}
                        errorId={errorId}
                        isDevelopment={true}
                    />
                    {error.stack && (
                        <div className="mt-8 p-4 bg-destructive/10 rounded-md">
                            <pre className="text-xs overflow-auto">
                                <code>{error.stack}</code>
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Production: user-friendly error page
    return (
        <ErrorPage
            title="Something went wrong"
            message="We're sorry, but something unexpected happened. Our team has been notified and is looking into it."
            errorId={errorId}
            statusCode={500}
            isDevelopment={false}
        />
    );
}
