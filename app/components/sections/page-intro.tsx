import clsx from "clsx";

import { Container } from "~/components/ui/container";
import { Fader } from "~/components//fader";
import type React from "react";

export function PageIntro({
    eyebrow,
    title,
    children,
    className,
    centered = false,
}: {
    eyebrow: string | React.ReactNode;
    title: string | React.ReactNode;
    children: React.ReactNode;
    className?: string;
    centered?: boolean;
}) {
    return (
        <Container
            className={clsx(
                "mt-24 sm:mt-32 lg:mt-40",
                centered && "text-center",
                className && className
            )}
        >
            <Fader>
                {typeof eyebrow === "string" ? (
                    <h1>
                        <span className="block font-display text-base font-semibold text-foreground/75">
                            {eyebrow}
                        </span>
                        <span className="sr-only"> - </span>
                        <span
                            className={clsx(
                                "mt-4 lg:mt-6 block max-w-5xl font-display font-medium tracking-tight text-foreground [text-wrap:balance] text-3xl lg:text-6xl",
                                centered && "mx-auto"
                            )}
                        >
                            {title}
                        </span>
                    </h1>
                ) : (
                    <>
                        {eyebrow}

                        <h1
                            className={clsx(
                                "mt-4 lg:mt-6 block max-w-5xl font-display font-medium tracking-tight text-foreground [text-wrap:balance] text-3xl lg:text-6xl",
                                centered && "mx-auto"
                            )}
                        >
                            {title}
                        </h1>
                    </>
                )}

                <div
                    className={clsx(
                        "mt-4 lg:mt-6 max-w-3xl text-lg lg:text-xl text-foreground/50",
                        centered && "mx-auto"
                    )}
                >
                    {children}
                </div>
            </Fader>
        </Container>
    );
}
