/**
 * Catch Boundary Component
 * 
 * Handles HTTP errors (4xx, redirects) from React Router.
 * Separate from ErrorBoundary which handles unexpected errors.
 */

import { isRouteErrorResponse, useRouteError } from "react-router";
import { ErrorPage } from "./ErrorPage";

export function CatchBoundary() {
    const error = useRouteError();
    const isDevelopment = import.meta.env.DEV;

    if (isRouteErrorResponse(error)) {
        const status = error.status;
        let title = "Error";
        let message = error.statusText || "An error occurred";

        switch (status) {
            case 404:
                title = "Page Not Found";
                message =
                    "The page you're looking for doesn't exist or has been moved.";
                break;
            case 403:
                title = "Access Denied";
                message =
                    "You don't have permission to access this resource.";
                break;
            case 401:
                title = "Unauthorized";
                message = "Please sign in to access this page.";
                break;
            case 400:
                title = "Bad Request";
                message = "The request was invalid. Please try again.";
                break;
            default:
                if (status >= 500) {
                    title = "Server Error";
                    message = "An error occurred on our end. Please try again later.";
                }
        }

        return (
            <ErrorPage
                title={title}
                message={message}
                statusCode={status}
                errorId={error.data?.errorId}
                isDevelopment={isDevelopment}
            />
        );
    }

    // Fallback for non-HTTP errors
    return (
        <ErrorPage
            title="Error"
            message="An unexpected error occurred."
            isDevelopment={isDevelopment}
        />
    );
}

