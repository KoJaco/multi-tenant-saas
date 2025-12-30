import { useEffect, useRef } from "react";
import { useInView } from "motion/react";
import { PageIntro } from "~/components/sections/page-intro";
import type { MarketingSection } from "../types";

type MarketingHeroSectionProps = {
    section: MarketingSection;
    onInView: (sectionId: string) => void;
};

export function MarketingHeroSection({
    section,
    onInView,
}: MarketingHeroSectionProps) {
    const sectionRef = useRef(null);
    const inView = useInView(sectionRef, { margin: "-50% 0px -50% 0px" });

    useEffect(() => {
        if (inView) {
            onInView(section.id);
        }
    }, [inView, section.id, onInView]);

    return (
        <div
            key={section.id}
            ref={sectionRef}
            id={section.id}
            className="w-full max-w-xl mx-auto scroll-mt-20 bg-transparent h-full"
        >
            <PageIntro
                eyebrow={
                    typeof section.eyebrow === "string"
                        ? `${section.eyebrow}`
                        : section.eyebrow
                }
                title={section.title}
            >
                <div>{section.body}</div>
            </PageIntro>
        </div>
    );
}
