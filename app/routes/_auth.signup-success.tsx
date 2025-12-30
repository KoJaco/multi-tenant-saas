import { Link } from "react-router";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components/fader";

export default function SignupSuccess() {
    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 left-0 top-1/2 -z-10 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(0%,0rem)] aspect-1313/771 w-128.25 bg-linear-to-tr from-primary to-[#9089fc] opacity-10"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="bg-background/25 p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px] border">
                        <div className="text-center">
                            <div className="flex justify-center mb-4">
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                    <svg
                                        className="w-6 h-6 text-emerald-500"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold">
                                Account Created Successfully!
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                We've sent a verification email to your inbox.
                                Please verify your email to access your
                                dashboard.
                            </p>
                        </div>

                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-700 dark:text-emerald-200 sm:max-w-[440px] mx-auto">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 mt-0.5">
                                    <svg
                                        className="w-4 h-4"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium">
                                        Check your email
                                    </p>
                                    <p className="mt-1">
                                        Click the verification link in your
                                        email to activate your account and
                                        access your dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground mb-3">
                                    Didn't receive the email?
                                </p>
                                <Link
                                    to="/auth/resend-confirmation"
                                    className="text-sm text-primary hover:underline font-medium"
                                >
                                    Resend verification email
                                </Link>
                            </div>

                            <div className="text-center pt-4 border-t border-border">
                                <Link
                                    to="/login"
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                    ← Back to login
                                </Link>
                            </div>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
    );
}
