import { Link, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components/fader";

export default function AuthError() {
    const [searchParams] = useSearchParams();
    const error = searchParams.get("error");
    const message = searchParams.get("message");

    const getErrorContent = () => {
        switch (error) {
            case "verification_failed":
                return {
                    title: "Email Verification Failed",
                    description:
                        "We couldn't verify your email address. This could be because the verification link has expired or is invalid.",
                    action: "resend",
                    actionText: "Resend Verification Email",
                    actionLink: "/auth/resend-confirmation",
                };
            case "invalid_token":
                return {
                    title: "Invalid Verification Link",
                    description:
                        "The verification link you clicked is invalid or has expired. Please request a new verification email.",
                    action: "resend",
                    actionText: "Request New Verification Email",
                    actionLink: "/auth/resend-confirmation",
                };
            case "email_not_confirmed":
                return {
                    title: "Email Not Verified",
                    description:
                        "Please check your email and click the verification link to activate your account.",
                    action: "resend",
                    actionText: "Resend Verification Email",
                    actionLink: "/auth/resend-confirmation",
                };
            default:
                return {
                    title: "Authentication Error",
                    description:
                        message ||
                        "There was a problem with the authentication process. Please try again.",
                    action: "login",
                    actionText: "Return to Login",
                    actionLink: "/login",
                };
        }
    };

    const errorContent = getErrorContent();

    return (
        // <MarketingLayout>
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 left-0 top-1/2 -z-10 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(0%,0rem)] aspect-[1313/771] w-[32.0625rem] bg-gradient-to-tr from-primary to-[#9089fc] opacity-10"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <Fader className="p-8 flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px]">
                        <div className="text-center">
                            <div className="flex justify-center mb-4">
                                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                                    <svg
                                        className="w-6 h-6 text-destructive"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-destructive">
                                {errorContent.title}
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {errorContent.description}
                            </p>
                        </div>

                        <div className="flex flex-col gap-y-4">
                            <Link
                                to={errorContent.actionLink}
                                className="w-full"
                            >
                                <Button className="w-full">
                                    {errorContent.actionText}
                                </Button>
                            </Link>

                            <div className="text-center">
                                <Link
                                    to="/"
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                    ← Back to Home
                                </Link>
                            </div>
                        </div>
                    </Fader>
                </Container>
            </main>
        </div>
        // </MarketingLayout>
    );
}
