export type MarketingSectionId = string;

export type MarketingSection = {
    id: MarketingSectionId;
    title: string | React.ReactNode;
    eyebrow: string | React.ReactNode;
    body: string | React.ReactNode;
    image?: { src: string; aspect: number };
};

export type NavigationItem = {
    id: MarketingSectionId;
    title: string;
};

export type MarketingLayoutConfig = {
    sections: Record<MarketingSectionId, MarketingSection>;
    navigation: NavigationItem[];
    brandName?: string;
    brandTagline?: string | React.ReactNode;
};

