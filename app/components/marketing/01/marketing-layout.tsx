import { useDeferredValue, useRef, useState } from "react";
import BackgroundStatic from "~/components/background-static";
import { MobileNavigationSheet } from "./mobile-navigation-sheet";
import { DesktopNavigationSidebar } from "./desktop-navigation-sidebar";
import { MarketingHeroSection } from "./marketing-hero-section";
import { MarketingBodySection } from "./marketing-body-section";
import { MarketingCTASection } from "./marketing-cta-section";
import type { MarketingLayoutConfig, MarketingSection } from "../types";

type MarketingLayoutProps = {
    config: MarketingLayoutConfig;
    authUser: { id: string } | null;
};

export function MarketingLayout({ config, authUser }: MarketingLayoutProps) {
    const [immediateSection, setImmediateSection] = useState<string | null>(
        null
    );
    const deferredSection = useDeferredValue(immediateSection);
    const [menuOpen, setMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const handleMobileNav = (id: string) => {
        setMenuOpen(false);
        setTimeout(() => {
            const element = document.getElementById(id);
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 500);
    };

    const handleSectionInView = (sectionId: string) => {
        setImmediateSection(sectionId);
    };

    const sectionsArray = Object.values(config.sections);
    const lastSectionId = sectionsArray[sectionsArray.length - 1]?.id;

    return (
        <div className="flex flex-col w-full h-full relative">
            <BackgroundStatic />
            <div className="w-full max-w-xl mx-auto">
                <div className="flex flex-col max-w-xl mx-auto w-full justify-center">
                    <MobileNavigationSheet
                        navigationItems={config.navigation}
                        authUser={authUser}
                        isOpen={menuOpen}
                        onOpenChange={setMenuOpen}
                        onNavigate={handleMobileNav}
                        brandName={config.brandName}
                        brandTagline={config.brandTagline}
                    />

                    <DesktopNavigationSidebar
                        navigationItems={config.navigation}
                        activeSection={deferredSection}
                        onNavigate={scrollToSection}
                        brandName={config.brandName}
                        brandTagline={config.brandTagline}
                        authUser={authUser}
                    />
                </div>
            </div>

            <div ref={containerRef} className="flex flex-col gap-y-32 h-full">
                {sectionsArray.map((section, index) => {
                    if (index === 0) {
                        return (
                            <MarketingHeroSection
                                key={section.id + "_" + index}
                                section={section}
                                onInView={handleSectionInView}
                            />
                        );
                    } else if (section.id === lastSectionId) {
                        return (
                            <MarketingCTASection
                                key={section.id}
                                section={section}
                                index={index}
                                onInView={handleSectionInView}
                            />
                        );
                    } else {
                        return (
                            <MarketingBodySection
                                key={section.id}
                                section={section}
                                index={index}
                                onInView={handleSectionInView}
                            />
                        );
                    }
                })}
            </div>
        </div>
    );
}
