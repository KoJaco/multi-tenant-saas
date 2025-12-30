import { useEffect, useRef } from "react";
import { useInView } from "motion/react";
import { SectionIntro } from "~/components/sections/section-intro";
import { Container } from "~/components/ui/container";
import { Fader } from "~/components//fader";
import type { MarketingSection } from "../types";

type MarketingBodySectionProps = {
    section: MarketingSection;
    index: number;
    onInView: (sectionId: string) => void;
};

export function MarketingBodySection({
    section,
    index,
    onInView,
}: MarketingBodySectionProps) {
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
            className="flex flex-col bg-transparent h-full w-full scroll-mt-40"
        >
            <div className="min-h-[600px] max-w-xl text-left w-full mx-auto">
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
                        <div>
                            {typeof section.body === "string" ? (
                                <p className="whitespace-pre-line text-foreground/50">
                                    {section.body}
                                </p>
                            ) : (
                                <>{section.body}</>
                            )}
                        </div>
                        {section.image && (
                            <div className="mt-4 rounded-lg overflow-hidden relative group/img">
                                <div className="absolute bg-primary-foreground top-0 left-0 w-full h-full opacity-20 group-hover/img:opacity-10 transition-all duration-500 z-10" />
                                <img
                                    src={section.image.src}
                                    alt=""
                                    className="group-hover/img:scale-105 transition-transform duration-500"
                                />
                            </div>
                        )}
                    </Fader>
                </Container>
            </div>
        </section>
    );
}
