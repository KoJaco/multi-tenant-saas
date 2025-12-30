import { Link, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Container } from "~/components/ui/container";
import { CheckCircle } from "lucide-react";

export default function InvitationWelcome() {
    const [searchParams] = useSearchParams();
    const accountName = searchParams.get("account") || "your account";
    const roleName = searchParams.get("role") || "team member";

    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 transform-gpu overflow-hidden opacity-30 blur-3xl">
                <div className="ml-[max(50%,38rem)] md:ml-[max(25%,38rem)] aspect-[1313/771] w-[82.0625rem] bg-gradient-to-tr from-primary to-primary/50 opacity-30"></div>
            </div>
            <main className="flex flex-1 items-center justify-center">
                <Container>
                    <div className="bg-background/25 shadow-xl border p-8 rounded-lg flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px] mx-auto text-center">
                        <div className="flex justify-center">
                            <CheckCircle className="w-16 h-16 text-emerald-600" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold text-foreground">
                                Welcome to the team!
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                You've successfully accepted the invitation to
                                join{" "}
                                <span className="font-medium text-foreground">
                                    {accountName}
                                </span>{" "}
                                as a{" "}
                                <span className="font-medium text-foreground">
                                    {roleName}
                                </span>
                                .
                            </p>
                        </div>

                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm">
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="font-medium text-emerald-700 dark:text-emerald-300">
                                        Account Setup Complete
                                    </p>
                                    <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                                        Your account has been created and you
                                        now have access to the dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Button asChild className="w-full">
                                <Link to="/dashboard">Go to Dashboard</Link>
                            </Button>

                            <Button
                                variant="outline"
                                asChild
                                className="w-full"
                            >
                                <Link to="/dashboard/account">
                                    Set up your account
                                </Link>
                            </Button>
                        </div>
                    </div>
                </Container>
            </main>
        </div>
    );
}
