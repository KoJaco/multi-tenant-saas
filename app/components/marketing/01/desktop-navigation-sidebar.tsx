import { cn } from "~/lib/utils";
import { Fader, FaderStagger } from "~/components//fader";
import type { NavigationItem } from "../types";
import { Separator } from "~/components/ui/separator";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

const itemVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0 },
};

type DesktopNavigationSidebarProps = {
    navigationItems: NavigationItem[];
    activeSection: string | null;
    onNavigate: (id: string) => void;
    brandName?: string;
    brandTagline?: string | React.ReactNode;
    authUser: { id: string } | null;
};

export function DesktopNavigationSidebar({
    navigationItems,
    activeSection,
    onNavigate,
    brandName,
    brandTagline,
    authUser,
}: DesktopNavigationSidebarProps) {
    return (
        <FaderStagger
            key="fixed-nav"
            className={cn(
                "max-w-[160px] text-sm gap-y-2 flex-col text-foreground/50 lg:flex hidden transition-opacity duration-300 fixed left-10 top-40 group/nav",
                !activeSection ? "opacity-0" : "opacity-100"
            )}
        >
            <Fader>
                <h1 className="text-xl text-foreground mb-2">{brandName}</h1>
                <p className="text-md mb-4">
                    {brandTagline || (
                        <>
                            Structured output, <br />
                            powerful natural language
                        </>
                    )}
                </p>
            </Fader>
            {navigationItems.map((navItem) => {
                return (
                    <Fader key={navItem.id} variants={itemVariants}>
                        <button
                            className={cn(
                                "capitalize -ml-4 group/item hover:-ml-0 transition-all duration-300",
                                activeSection === navItem.id && "-ml-0"
                            )}
                            onClick={() => onNavigate(navItem.id)}
                        >
                            <span
                                className={cn(
                                    "mr-2 opacity-0 duration-300 transition-all group-hover/item:opacity-100 group-hover/item:text-foreground/25",
                                    activeSection === navItem.id
                                        ? "opacity-100 text-primary/75"
                                        : "opacity-0"
                                )}
                            >
                                #
                            </span>
                            <span
                                className={cn(
                                    activeSection === navItem.id
                                        ? "text-primary"
                                        : "text-foreground/25"
                                )}
                            >
                                {navItem.title}
                            </span>
                        </button>
                    </Fader>
                );
            })}

            {authUser ? (
                <Fader>
                    <Separator className="my-4 opacity-25 w-1/2" />
                    <Link to="/dashboard">Dashboard</Link>
                </Fader>
            ) : (
                <Fader>
                    <Separator className="my-4 opacity-25 w-1/2" />
                    <Link
                        to="/dashboard"
                        className="flex items-center gap-x-[2px] hover:gap-x-[4px] text-foreground/50 hover:text-foreground/75 transition-all duration-100"
                    >
                        Login
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Fader>
            )}
        </FaderStagger>
    );
}
