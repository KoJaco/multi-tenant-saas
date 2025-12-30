import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Button } from "~/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { createAuthSupabaseClient } from "~/lib/auth/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { supabase } = await createAuthSupabaseClient(request);

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        return {
            error: "No user found",
            isVerified: false,
            status: 401,
        };
    }

    return {
        email: user.email,
        isVerified: user.email_confirmed_at !== null,
        status: 200,
        error: "",
    };
}

export default function VerifyEmail() {
    const { email, isVerified, error } = useLoaderData<typeof loader>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleResendConfirmation = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch("/auth/resend-confirmation", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            if (!response.ok) {
                throw new Error("Failed to resend confirmation email");
            }
        } catch (error) {
            // Error is handled by the UI - user can try again
            // In production, you might want to show a toast notification
        } finally {
            setIsSubmitting(false);
        }
    };

    if (error) {
        return (
            <div className="flex min-h-screen flex-col">
                <main className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-md space-y-8 px-4">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold">Error</h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {error}
                            </p>
                        </div>
                        <div className="text-center">
                            <Link
                                to="/login"
                                className="text-sm text-primary hover:underline"
                            >
                                Return to login
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (isVerified) {
        return (
            <div className="flex min-h-screen flex-col">
                <main className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-md space-y-8 px-4">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold">
                                Email Verified
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Your email has been successfully verified. You
                                can now access your account.
                            </p>
                        </div>
                        <div className="text-center">
                            <Link
                                to="/dashboard"
                                className="text-sm text-primary hover:underline"
                            >
                                Go to Dashboard
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex flex-1 items-center justify-center">
                <div className="w-full max-w-md space-y-8 px-4">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold">
                            Verify your email
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            We've sent a verification email to {email}. Please
                            check your inbox and click the verification link.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Button
                            onClick={handleResendConfirmation}
                            disabled={isSubmitting}
                            className="w-full"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                "Resend verification email"
                            )}
                        </Button>

                        <div className="text-center text-sm">
                            <span className="text-muted-foreground">
                                Already verified?{" "}
                            </span>
                            <Link
                                to="/login"
                                className="font-medium text-primary hover:underline"
                            >
                                Sign in
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
