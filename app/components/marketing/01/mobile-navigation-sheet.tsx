import { Link } from "react-router";
import { ArrowRight, Equal } from "lucide-react";
import { cn } from "~/lib/utils";
import { buttonVariants } from "~/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";
import { Fader, FaderStagger } from "~/components//fader";
import BackgroundStatic from "~/components/background-static";
import { Footer } from "~/components/sections/footer";
import type { NavigationItem } from "../types";

const itemVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0 },
};

type MobileNavigationSheetProps = {
    navigationItems: NavigationItem[];
    authUser: { id: string } | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (id: string) => void;
    brandName?: string;
    brandTagline?: string | React.ReactNode;
};

export function MobileNavigationSheet({
    navigationItems,
    authUser,
    isOpen,
    onOpenChange,
    onNavigate,
    brandName = "Claimified",
    brandTagline,
}: MobileNavigationSheetProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <div className="lg:hidden">
                <header className="w-full h-[70px]">
                    <div className="justify-between flex items-center h-full w-full mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="w-auto">
                            <span>{brandName}</span>
                        </div>
                        <SheetTrigger className="ml-auto">
                            <Equal />
                        </SheetTrigger>
                    </div>
                </header>
                <SheetContent
                    side="top"
                    className="w-full h-auto p-2 bg-transparent border-0"
                >
                    <div className="w-full h-full bg-card rounded-lg relative">
                        <BackgroundStatic />
                        <Fader className="max-w-xl mx-auto px-6 h-full w-full">
                            <SheetHeader className="pt-24 sm:pt-32 lg:pt-40 text-left px-0">
                                <SheetTitle>{brandName}</SheetTitle>
                                <SheetDescription>
                                    {brandTagline || (
                                        <>
                                            <span className="text-primary">
                                                Claims{" "}
                                            </span>
                                            verified,
                                            <br />
                                            in{" "}
                                            <span className="text-primary">
                                                real-time
                                            </span>
                                        </>
                                    )}
                                </SheetDescription>
                                <div></div>
                            </SheetHeader>

                            <FaderStagger className="flex flex-col gap-y-4 mt-6 -ml-1">
                                {navigationItems.map((navItem) => {
                                    return (
                                        <Fader
                                            key={navItem.id}
                                            variants={itemVariants}
                                        >
                                            <button
                                                className={cn(
                                                    "capitalize -ml-4 group hover:ml-1 transition-all duration-300 text-xl text-foreground/50 hover:text-primary"
                                                )}
                                                onClick={() =>
                                                    onNavigate(navItem.id)
                                                }
                                            >
                                                <span
                                                    className={cn(
                                                        "mr-2 opacity-0 duration-300 transition-all group-hover:opacity-100 text-foreground/50"
                                                    )}
                                                >
                                                    #
                                                </span>
                                                {navItem.title}
                                            </button>
                                        </Fader>
                                    );
                                })}
                            </FaderStagger>
                            <div className="mt-16 -mb-8">
                                {authUser ? (
                                    <Link
                                        to="/dashboard"
                                        className={cn(
                                            buttonVariants({
                                                variant: "outline",
                                            })
                                        )}
                                    >
                                        Dashboard
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                ) : (
                                    <Link
                                        to="/login"
                                        className={cn(
                                            buttonVariants({
                                                variant: "outline",
                                            })
                                        )}
                                    >
                                        Login to your account
                                    </Link>
                                )}
                            </div>
                        </Fader>
                        <Footer className="block w-full h-auto md:mt-24 mt-12" />
                    </div>
                </SheetContent>
            </div>
        </Sheet>
    );
}
