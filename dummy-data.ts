// Dummy data for UI design and testing
export type DummyVerdict = "supported" | "disputed" | "uncertain";
export type DummyState =
    | "consolidating"
    | "analyzing"
    | "searching"
    | "retrying"
    | "judging"
    | "final";

export interface DummyCitation {
    url: string;
    title: string;
    published_at?: string | null;
    quote: string;
}

export interface DummyClaimEngineData {
    status: string;
    relationLemma?: string;
    confidence: number;
    claimKey?: string;
    subjectCanonical?: string;
    subjectSurface?: string;
}

export interface DummyFactCheckCard {
    id: string;
    state: DummyState;
    claim?: string;
    subject?: string;
    seeds?: string[];
    context?: string;
    verdict?: DummyVerdict;
    confidence?: number;
    rationale?: string;
    citations?: DummyCitation[];
    nowISO?: string;
    claimEngineData?: DummyClaimEngineData;
}

// Initial quote extraction phase
export const dummyConsolidatingData: DummyFactCheckCard = {
    id: "fc-001",
    state: "consolidating",
    claim: "The unemployment rate in the United States dropped to 3.7% in September 2023",
    subject: "unemployment rate",
    context: "Economic discussion about job market recovery",
};

// Analysis phase
export const dummyAnalyzingData: DummyFactCheckCard = {
    id: "fc-002",
    state: "analyzing",
    claim: "Tesla's stock price increased by 15% following the Q3 earnings report",
    subject: "Tesla stock performance",
    context: "Financial news segment discussing quarterly earnings",
    claimEngineData: {
        status: "READY",
        relationLemma: "increased",
        confidence: 0.85,
        claimKey: "tesla_stock_q3_2023",
        subjectCanonical: "Tesla Inc.",
        subjectSurface: "Tesla",
    },
};

// Searching phase
export const dummySearchingData: DummyFactCheckCard = {
    id: "fc-003",
    state: "searching",
    claim: "The COVID-19 vaccine was developed in under a year using mRNA technology",
    subject: "COVID-19 vaccine development",
    context: "Medical discussion about vaccine research timeline",
    seeds: [
        "mRNA vaccine development",
        "COVID-19 research timeline",
        "Pfizer Moderna vaccine",
    ],
    claimEngineData: {
        status: "QUEUED",
        relationLemma: "developed",
        confidence: 0.92,
        claimKey: "covid_vaccine_mrna_timeline",
        subjectCanonical: "COVID-19 vaccine",
        subjectSurface: "COVID-19 vaccine",
    },
};

// Judging phase
export const dummyJudgingData: DummyFactCheckCard = {
    id: "fc-004",
    state: "judging",
    claim: "Renewable energy sources now account for over 30% of global electricity generation",
    subject: "renewable energy adoption",
    context: "Climate policy discussion about energy transition",
    seeds: [
        "renewable energy statistics",
        "global electricity mix",
        "solar wind hydro capacity",
    ],
    claimEngineData: {
        status: "CHECKING",
        relationLemma: "account for",
        confidence: 0.78,
        claimKey: "renewable_energy_global_share",
        subjectCanonical: "renewable energy sources",
        subjectSurface: "renewable energy",
    },
};

// Final - Supported verdict
export const dummyFinalSupportedData: DummyFactCheckCard = {
    id: "fc-005",
    state: "final",
    claim: "The James Webb Space Telescope was launched on December 25, 2021",
    subject: "James Webb Space Telescope",
    context: "Space exploration discussion about telescope deployment",
    verdict: "supported",
    confidence: 0.98,
    rationale:
        "This claim is supported by multiple authoritative sources including NASA's official records, space agency press releases, and news reports from the launch date. The James Webb Space Telescope was indeed launched on December 25, 2021, from the Guiana Space Centre in French Guiana aboard an Ariane 5 rocket.",
    citations: [
        {
            url: "https://www.nasa.gov/webb-launch",
            title: "NASA - James Webb Space Telescope Launch",
            published_at: "2021-12-25",
            quote: "The James Webb Space Telescope successfully launched on December 25, 2021, at 7:20 a.m. EST from the Guiana Space Centre in Kourou, French Guiana.",
        },
        {
            url: "https://www.esa.int/Science_Exploration/Space_Science/Webb",
            title: "ESA - Webb Space Telescope",
            published_at: "2021-12-25",
            quote: "The launch of the James Webb Space Telescope marks a historic milestone in space astronomy, with the telescope successfully departing Earth on Christmas Day 2021.",
        },
        {
            url: "https://www.space.com/james-webb-space-telescope-launch-success",
            title: "Space.com - Webb Telescope Launch Success",
            published_at: "2021-12-25",
            quote: "The James Webb Space Telescope launched successfully on December 25, 2021, beginning its journey to revolutionize our understanding of the universe.",
        },
    ],
    nowISO: "2024-01-15T10:30:00Z",
    claimEngineData: {
        status: "VERIFIED",
        relationLemma: "launched",
        confidence: 0.98,
        claimKey: "jwst_launch_date_2021",
        subjectCanonical: "James Webb Space Telescope",
        subjectSurface: "James Webb Space Telescope",
    },
};

// Final - Disputed verdict
export const dummyFinalDisputedData: DummyFactCheckCard = {
    id: "fc-006",
    state: "final",
    claim: "Electric vehicles produce more carbon emissions than gasoline cars during manufacturing",
    subject: "electric vehicle emissions",
    context: "Environmental debate about EV lifecycle emissions",
    verdict: "disputed",
    confidence: 0.87,
    rationale:
        "This claim is disputed by multiple peer-reviewed studies and lifecycle analyses. While EVs do have higher manufacturing emissions due to battery production, their operational emissions are significantly lower. Over the vehicle's lifetime, EVs typically produce 50-70% fewer total emissions than gasoline vehicles, even accounting for manufacturing.",
    citations: [
        {
            url: "https://www.epa.gov/greenvehicles/electric-vehicle-myths",
            title: "EPA - Electric Vehicle Myths vs Facts",
            published_at: "2023-08-15",
            quote: "Over the lifetime of the vehicle, total greenhouse gas emissions associated with manufacturing, charging, and driving an EV are typically lower than the total GHGs associated with a gasoline car.",
        },
        {
            url: "https://www.ucsusa.org/resources/clean-cars-2023",
            title: "UCS - Clean Cars Report 2023",
            published_at: "2023-03-20",
            quote: "Our analysis shows that EVs produce less than half the emissions of gasoline cars over their lifetime, even when accounting for manufacturing emissions.",
        },
    ],
    nowISO: "2024-01-15T10:30:00Z",
    claimEngineData: {
        status: "REFUTED",
        relationLemma: "produce more",
        confidence: 0.87,
        claimKey: "ev_vs_gasoline_emissions_manufacturing",
        subjectCanonical: "electric vehicles",
        subjectSurface: "electric vehicles",
    },
};

// Final - Uncertain verdict
export const dummyFinalUncertainData: DummyFactCheckCard = {
    id: "fc-007",
    state: "final",
    claim: "Artificial intelligence will replace 40% of all jobs within the next decade",
    subject: "artificial intelligence job displacement",
    context: "Future of work discussion about AI automation",
    verdict: "uncertain",
    confidence: 0.65,
    rationale:
        "This claim is uncertain due to conflicting predictions from various studies and experts. While some research suggests significant job displacement, others predict job transformation rather than replacement. The exact percentage varies widely depending on methodology, industry focus, and timeframe assumptions. More research is needed to determine the precise impact.",
    citations: [
        {
            url: "https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/the-future-of-work-after-covid-19",
            title: "McKinsey - Future of Work Report",
            published_at: "2021-02-18",
            quote: "Our analysis suggests that by 2030, 14% of workers globally may need to change occupational categories due to automation and AI.",
        },
        {
            url: "https://www.weforum.org/reports/the-future-of-jobs-report-2023",
            title: "World Economic Forum - Future of Jobs 2023",
            published_at: "2023-05-01",
            quote: "The report estimates that while 83 million jobs may be eliminated by 2027, 69 million new jobs may emerge, resulting in a net decrease of 14 million jobs.",
        },
    ],
    nowISO: "2024-01-15T10:30:00Z",
    claimEngineData: {
        status: "UNCERTAIN",
        relationLemma: "replace",
        confidence: 0.65,
        claimKey: "ai_job_replacement_percentage",
        subjectCanonical: "artificial intelligence",
        subjectSurface: "artificial intelligence",
    },
};

// Array of all dummy data for easy iteration
export const allDummyData: DummyFactCheckCard[] = [
    dummyConsolidatingData,
    dummyAnalyzingData,
    dummySearchingData,
    dummyJudgingData,
    dummyFinalSupportedData,
    dummyFinalDisputedData,
    dummyFinalUncertainData,
];

// Retrying phase (for completeness)
export const dummyRetryingData: DummyFactCheckCard = {
    id: "fc-008",
    state: "retrying",
    claim: "The average global temperature has increased by 1.1°C since pre-industrial times",
    subject: "global temperature rise",
    context: "Climate science discussion about temperature trends",
    seeds: [
        "global warming temperature",
        "climate change data",
        "IPCC temperature report",
    ],
    claimEngineData: {
        status: "QUEUED",
        relationLemma: "increased",
        confidence: 0.89,
        claimKey: "global_temperature_preindustrial",
        subjectCanonical: "global average temperature",
        subjectSurface: "global temperature",
    },
};
