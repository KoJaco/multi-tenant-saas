export const Pricing = {
    freeTrial: {
        minutes: 60, // 60 free minutes
        claims: 20, // 20 free claims
        durationDays: 14, // trial length
    },

    pro: {
        monthly: 29_00, // $29.00 AUD in cents
        includedMinutes: 500, // bundle generous minutes
        includedClaims: 250, // bundle some claims
    },

    seat: {
        monthly: 9_00, // $9.00 AUD per extra seat
    },

    creditPacks: {
        small: {
            price: 10_00, // $10.00 AUD
            minutes: 160,
            claims: 50,
        },
        medium: {
            price: 29_00, // $29.00 AUD
            minutes: 535,
            claims: 150,
        },
        large: {
            price: 59_00, // $59.00 AUD
            minutes: 1200,
            claims: 340,
        },
        custom: {
            // Base per $1 AUD
            minutesPerUnit: 16,
            claimsPerUnit: 5,
            minPurchase: 2_00, // enforce minimum $10 custom top-up
        },
    },

    proBonus: {
        // multiplier applied in webhook when account.plan === "pro"
        minutes: 1.1, // +10% bonus minutes
        claims: 1.1, // +10% bonus claims
    },
} as const;

type EffectiveRate = {
    label: string;
    costAUD: number; // total cost in AUD
    minutes: number;
    claims: number;
    perMinute: number; // AUD per minute
    perClaim: number; // AUD per claim
};

// helper to avoid division by zero
const safeDiv = (num: number, denom: number) => (denom > 0 ? num / denom : 0);

export const EffectiveRates: EffectiveRate[] = [
    {
        label: "Free Trial",
        costAUD: 0,
        minutes: Pricing.freeTrial.minutes,
        claims: Pricing.freeTrial.claims,
        perMinute: 0,
        perClaim: 0,
    },
    {
        label: "Pro Plan (monthly)",
        costAUD: Pricing.pro.monthly / 100, // cents -> AUD
        minutes: Pricing.pro.includedMinutes,
        claims: Pricing.pro.includedClaims,
        perMinute: safeDiv(
            Pricing.pro.monthly / 100,
            Pricing.pro.includedMinutes
        ),
        perClaim: safeDiv(
            Pricing.pro.monthly / 100,
            Pricing.pro.includedClaims
        ),
    },
    {
        label: "Credit Pack - Small",
        costAUD: Pricing.creditPacks.small.price / 100,
        minutes: Pricing.creditPacks.small.minutes,
        claims: Pricing.creditPacks.small.claims,
        perMinute: safeDiv(
            Pricing.creditPacks.small.price / 100,
            Pricing.creditPacks.small.minutes
        ),
        perClaim: safeDiv(
            Pricing.creditPacks.small.price / 100,
            Pricing.creditPacks.small.claims
        ),
    },
    {
        label: "Credit Pack - Medium",
        costAUD: Pricing.creditPacks.medium.price / 100,
        minutes: Pricing.creditPacks.medium.minutes,
        claims: Pricing.creditPacks.medium.claims,
        perMinute: safeDiv(
            Pricing.creditPacks.medium.price / 100,
            Pricing.creditPacks.medium.minutes
        ),
        perClaim: safeDiv(
            Pricing.creditPacks.medium.price / 100,
            Pricing.creditPacks.medium.claims
        ),
    },
    {
        label: "Credit Pack - Large",
        costAUD: Pricing.creditPacks.large.price / 100,
        minutes: Pricing.creditPacks.large.minutes,
        claims: Pricing.creditPacks.large.claims,
        perMinute: safeDiv(
            Pricing.creditPacks.large.price / 100,
            Pricing.creditPacks.large.minutes
        ),
        perClaim: safeDiv(
            Pricing.creditPacks.large.price / 100,
            Pricing.creditPacks.large.claims
        ),
    },
    {
        label: "Credit Pack - Custom (per $1)",
        costAUD: 1,
        minutes: Pricing.creditPacks.custom.minutesPerUnit,
        claims: Pricing.creditPacks.custom.claimsPerUnit,
        perMinute: safeDiv(1, Pricing.creditPacks.custom.minutesPerUnit),
        perClaim: safeDiv(1, Pricing.creditPacks.custom.claimsPerUnit),
    },
];

const stripeCustomerPortalLinks = {
    link: "https://billing.stripe.com/p/login/28E3cu50I3NcgWw0qte3e00",
};
