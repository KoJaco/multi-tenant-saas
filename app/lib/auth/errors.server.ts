/**
 * Authentication Error Utilities
 *
 * Provides standardized error response formatting and error message mapping
 * for authentication routes.
 */

/**
 * Standardized error response format
 * All auth routes should return this format for consistency
 */
export type AuthErrorResponse = {
    error: string;
    status: number;
    headers: Headers;
    action?: {
        label: string;
        to: string;
    };
    email?: string;
};

/**
 * Creates a standardized error response
 * Ensures all error responses include error, status, and headers
 * Optionally includes action information for UI components
 */
export function createErrorResponse(
    error: string,
    status: number = 400,
    headers: Headers = new Headers(),
    options?: {
        action?: {
            label: string;
            to: string;
        };
        email?: string;
    }
): AuthErrorResponse {
    return {
        error,
        status,
        headers,
        ...(options?.action && { action: options.action }),
        ...(options?.email && { email: options.email }),
    };
}

/**
 * Type guard to check if error has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
    return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
    );
}

/**
 * Maps Supabase auth errors to user-friendly messages
 */
export function mapAuthError(error: unknown): string {
    if (!hasMessage(error)) {
        return "An authentication error occurred. Please try again.";
    }

    const message = error.message.toLowerCase();

    // Login errors
    if (message.includes("invalid login credentials")) {
        return "Invalid email or password. Please check your credentials and try again.";
    }

    if (message.includes("email not confirmed")) {
        return "Please check your email and confirm your account before signing in.";
    }

    if (message.includes("too many requests")) {
        return "Too many login attempts. Please wait a moment before trying again.";
    }

    if (message.includes("user not found")) {
        return "No account found with this email address. Please sign up first.";
    }

    // Signup errors
    if (
        message.includes("already registered") ||
        message.includes("user already registered")
    ) {
        return "An account with this email address already exists. Please sign in instead.";
    }

    if (message.includes("invalid email")) {
        return "Please enter a valid email address.";
    }

    if (message.includes("password should be at least")) {
        return "Password must be at least 6 characters long.";
    }

    if (message.includes("unable to validate email address")) {
        return "Please enter a valid email address.";
    }

    if (message.includes("signup is disabled")) {
        return "Signup is currently disabled. Please contact support.";
    }

    if (message.includes("invalid password")) {
        return "Password must be at least 6 characters and contain only letters, numbers, spaces, and special characters.";
    }

    if (message.includes("invalid phone number")) {
        return "Please enter a valid phone number.";
    }

    // Generic fallback
    return "An error occurred during authentication. Please try again.";
}

/**
 * Maps Supabase auth errors to user-friendly messages with action information
 * Similar to the error content structure in _auth.error.tsx
 */
export function mapAuthErrorWithAction(
    error: unknown,
    email?: string
): {
    error: string;
    action?: {
        label: string;
        to: string;
    };
    email?: string;
} {
    if (!hasMessage(error)) {
        return {
            error: "An authentication error occurred. Please try again.",
        };
    }

    const message = error.message.toLowerCase();

    // Login errors
    if (message.includes("invalid login credentials")) {
        return {
            error: "Invalid email or password. Please check your credentials and try again.",
        };
    }

    if (message.includes("email not confirmed")) {
        return {
            error: "Please check your email and confirm your account before signing in.",
            action: {
                label: "Resend Verification Email",
                to: email
                    ? `/auth/resend-confirmation?email=${encodeURIComponent(email)}`
                    : "/auth/resend-confirmation",
            },
            ...(email && { email }),
        };
    }

    if (message.includes("too many requests")) {
        return {
            error: "Too many login attempts. Please wait a moment before trying again.",
        };
    }

    if (message.includes("user not found")) {
        return {
            error: "No account found with this email address. Please sign up first.",
            action: {
                label: "Create a new account",
                to: "/signup",
            },
        };
    }

    // Signup errors
    if (
        message.includes("already registered") ||
        message.includes("user already registered")
    ) {
        return {
            error: "An account with this email address already exists. Please sign in instead.",
            action: {
                label: "Sign in",
                to: "/login",
            },
        };
    }

    if (message.includes("invalid email")) {
        return {
            error: "Please enter a valid email address.",
        };
    }

    if (message.includes("password should be at least")) {
        return {
            error: "Password must be at least 6 characters long.",
        };
    }

    if (message.includes("unable to validate email address")) {
        return {
            error: "Please enter a valid email address.",
        };
    }

    if (message.includes("signup is disabled")) {
        return {
            error: "Signup is currently disabled. Please contact support.",
        };
    }

    if (message.includes("invalid password")) {
        return {
            error: "Password must be at least 6 characters and contain only letters, numbers, spaces, and special characters.",
        };
    }

    if (message.includes("invalid phone number")) {
        return {
            error: "Please enter a valid phone number.",
        };
    }

    // Generic fallback
    return {
        error: "An authentication error occurred. Please try again.",
    };
}

/**
 * Type guard to check if error is a PostgreSQL error
 */
export function isPostgresError(
    error: unknown
): error is { code: string; constraint?: string; message?: string } {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
    );
}

/**
 * Maps database errors to user-friendly messages
 */
export function mapDatabaseError(error: unknown): string {
    if (!error) {
        return "A database error occurred. Please try again.";
    }

    if (!isPostgresError(error)) {
        return "Unable to process your request. Please try again or contact support if the problem persists.";
    }

    // PostgreSQL error codes
    if (error.code === "23505") {
        // Unique constraint violation
        if (
            error.constraint?.includes("email") ||
            error.message?.includes("email")
        ) {
            return "An account with this email address already exists. Please sign in instead.";
        }
        return "This record already exists. Please try again.";
    }

    if (error.code === "23503") {
        // Foreign key constraint violation
        return "Account configuration error. Please contact support.";
    }

    // Generic database error
    return "Unable to process your request. Please try again or contact support if the problem persists.";
}
