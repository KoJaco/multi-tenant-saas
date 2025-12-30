import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { ModeToggle } from "../mode-toggle";
import { Container } from "../ui/container";

export function Footer({ className }: { className?: string }) {
    return (
        <footer className={cn("min-h-[200px] mt-24", className && className)}>
            <Container className="max-w-xl">
                <div className="max-w-xl mx-auto flex flex-col gap-8 border-t py-8">
                    <ul className="flex w-full text-xs text-foreground/75 gap-6">
                        <li className="hover:text-foreground flex items-center gap-1 transition-colors duration-300">
                            <span className="flex w-1 h-1 rounded-full bg-foreground/50" />
                            <Link to="policies/terms-of-service">
                                Terms of Service
                            </Link>
                        </li>
                        <li className="hover:text-foreground flex items-center gap-1 transition-colors duration-300">
                            <span className="flex w-1 h-1 rounded-full bg-foreground/50" />
                            <Link to="policies/privacy-policy">
                                Privacy Policy
                            </Link>
                        </li>
                    </ul>

                    <div className="flex justify-between gap-y-2 w-full items-center">
                        <div className="text-xs text-foreground/50">
                            <span className="text-primary">Claimified </span>
                            is powered by{" "}
                            <Link
                                to="https://www.schma.ai/"
                                className="text-foreground/75"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Schma.ai
                            </Link>
                        </div>

                        <ModeToggle />
                    </div>
                </div>
            </Container>
        </footer>
    );
}
