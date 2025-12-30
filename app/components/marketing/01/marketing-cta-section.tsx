import { useEffect, useRef } from "react";
import { useInView } from "motion/react";
import { SectionIntro } from "~/components/sections/section-intro";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components//fader";
import type { MarketingSection } from "../types";

type MarketingCTASectionProps = {
    section: MarketingSection;
    index: number;
    onInView: (sectionId: string) => void;
};

export function MarketingCTASection({
    section,
    index,
    onInView,
}: MarketingCTASectionProps) {
    const ref = useRef(null);
    const inView = useInView(ref, { margin: "-50% 0px -50% 0px" });

    useEffect(() => {
        if (inView) {
            onInView(section.id);
        }
    }, [inView, section.id, onInView]);

    return (
        <section
            key={section.id + "_" + index}
            id={section.id}
            ref={ref}
            className="flex flex-col transparent h-full w-full scroll-mt-40 min-h-[50vh]"
        >
            <div className="max-w-lg text-center w-full mx-auto bg-card p-8 shadow rounded-xl">
                <SectionIntro
                    eyebrow={
                        typeof section.eyebrow === "string"
                            ? `${section.eyebrow}`
                            : section.eyebrow
                    }
                    title={section.title}
                />
                <Container className="mt-8">
                    <Fader>
                        <div className="text-center flex w-full items-center justify-center">
                            {typeof section.body === "string" ? (
                                <p className="whitespace-pre-line text-foreground/50">
                                    {section.body}
                                </p>
                            ) : (
                                <>{section.body}</>
                            )}
                        </div>
                    </Fader>
                </Container>
            </div>
        </section>
    );
}
