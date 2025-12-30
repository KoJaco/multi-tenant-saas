import { HomeIcon, SettingsIcon, MenuIcon } from "lucide-react";
import { Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ContainerDashboard } from "~/components/ui/container";
import { UserMenu } from "~/components/user-menu";
import { Button } from "~/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";

export async function loader({ request }: LoaderFunctionArgs) {
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { authUser } = await requireUser(request);

    return { authUser };
}

export default function DashboardLayout() {
    const { authUser } = useLoaderData<typeof loader>();

    return (
        <div className="flex min-h-screen flex-col relative isolate">
            <div className="absolute inset-x-0 left-0 top-1/2 -z-10 transform-gpu overflow-hidden opacity-50 blur-3xl">
                <div className="ml-[max(0%,0rem)] aspect-[1313/771] w-[40.0625rem] bg-gradient-to-tr from-primary to-[#9089fc] opacity-10"></div>
            </div>
            <header>
                <ContainerDashboard>
                    <div className="flex h-16 items-center justify-between">
                        <h1 className="text-xl font-bold">Claimified</h1>

                        {/* Desktop Navigation */}
                        <nav className="hidden space-x-4 sm:flex border px-2 py-0.5 rounded-full shadow-xl">
                            <a
                                href="/dashboard"
                                className="hover:bg-foreground/10 rounded-full px-2 py-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                            >
                                <HomeIcon className="w-3 h-3" />
                                Dashboard
                            </a>
                            <a
                                href="/dashboard/account"
                                className="hover:bg-foreground/10 rounded-full px-2 py-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                            >
                                <SettingsIcon className="w-3 h-3" />
                                Account
                            </a>
                        </nav>

                        {/* Desktop User Menu */}
                        <div className="hidden sm:block">
                            <UserMenu user={authUser} />
                        </div>

                        {/* Mobile Menu */}
                        <div className="flex items-center gap-2 sm:hidden">
                            <UserMenu user={authUser} />
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                    >
                                        <MenuIcon className="h-4 w-4" />
                                        <span className="sr-only">
                                            Open menu
                                        </span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent
                                    side="right"
                                    className="w-[300px] sm:w-[400px]"
                                >
                                    <SheetHeader>
                                        <SheetTitle>Navigation</SheetTitle>
                                    </SheetHeader>

                                    <div className="flex flex-col space-y-4 mt-6 p-2">
                                        {/* Navigation Links */}
                                        <div className="space-y-2">
                                            <a
                                                href="/dashboard"
                                                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-sm hover:bg-card hover:text-card-foreground transition-colors"
                                            >
                                                <HomeIcon className="w-4 h-4" />
                                                Dashboard
                                            </a>
                                            <a
                                                href="/dashboard/account"
                                                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-sm hover:bg-card hover:text-card-foreground transition-colors"
                                            >
                                                <SettingsIcon className="w-4 h-4" />
                                                Account
                                            </a>
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                </ContainerDashboard>
            </header>

            {/* This renders the dashboard child routes */}
            <main className="flex-1 py-24">
                <ContainerDashboard>
                    <Outlet />
                </ContainerDashboard>
            </main>
        </div>
    );
}
