/**
 * Production Error Page Component
 * 
 * User-friendly error page for production environments.
 * Does not expose stack traces or sensitive information.
 */

import { Link } from "react-router";

interface ErrorPageProps {
    title?: string;
    message?: string;
    errorId?: string;
    statusCode?: number;
    isDevelopment?: boolean;
}

export function ErrorPage({
    title = "Something went wrong",
    message = "We're sorry, but something unexpected happened. Our team has been notified and is looking into it.",
    errorId,
    statusCode,
    isDevelopment = false,
}: ErrorPageProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full text-center">
                <div className="mb-8">
                    {statusCode && (
                        <h1 className="text-6xl font-bold text-muted-foreground mb-4">
                            {statusCode}
                        </h1>
                    )}
                    <h2 className="text-2xl font-semibold mb-4">{title}</h2>
                    <p className="text-muted-foreground mb-6">{message}</p>
                    {errorId && (
                        <p className="text-sm text-muted-foreground mb-6">
                            Error ID: <code className="font-mono">{errorId}</code>
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <Link
                        to="/"
                        className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Go Home
                    </Link>
                    {isDevelopment && (
                        <div className="mt-8 p-4 bg-muted rounded-md text-left">
                            <p className="text-sm font-semibold mb-2">
                                Development Mode:
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Check the console or server logs for more details.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

