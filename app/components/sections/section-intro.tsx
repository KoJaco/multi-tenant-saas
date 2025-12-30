import clsx from "clsx";

import { Container } from "~/components/ui/container";
import { Fader } from "~/components//fader";

export function SectionIntro({
    title,
    eyebrow,
    children,
    smaller = false,
    invert = false,
    ...props
}: Omit<
    React.ComponentPropsWithoutRef<typeof Container>,
    "title" | "children"
> & {
    title: string | React.ReactNode;
    eyebrow?: string | React.ReactNode;
    children?: React.ReactNode;
    smaller?: boolean;
    invert?: boolean;
}) {
    return (
        <Container {...props}>
            <Fader className="max-w-3xl">
                <h2>
                    {eyebrow && typeof eyebrow === "string" && (
                        <>
                            <span
                                className={clsx(
                                    "mb-6 block font-display text-base font-semibold capitalize",
                                    invert
                                        ? "text-background/75"
                                        : "text-foreground/75"
                                )}
                            >
                                {eyebrow}
                            </span>
                            <span className="sr-only"> - </span>
                        </>
                    )}

                    {eyebrow && typeof eyebrow !== "string" && eyebrow}

                    <span
                        className={clsx(
                            "block font-display tracking-tight [text-wrap:balance] capitalize",
                            smaller
                                ? "text-2xl font-semibold"
                                : "text-4xl font-medium sm:text-5xl",
                            invert ? "text-background" : "text-foreground"
                        )}
                    >
                        {title}
                    </span>
                </h2>
                {children && (
                    <div
                        className={clsx(
                            "mt-6 text-xl",
                            invert ? "text-background/50" : "text-foreground/50"
                        )}
                    >
                        {children}
                    </div>
                )}
            </Fader>
        </Container>
    );
}
