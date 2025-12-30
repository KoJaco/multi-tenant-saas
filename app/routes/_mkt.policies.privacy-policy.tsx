import PolicyWrapper from "~/components/policy-wrapper";

const privacyPolicySections = [
    {
        title: "Introduction",
        body: `
Kori Jacobsen ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our voice-enabled form filler application, website, and contact form. By submitting your information, you agree to the collection and use of your data in accordance with this policy.`,
    },
    {
        title: "Information We Collect",
        body: "When you use our contact form, we may collect the following personal data:",
        points: [
            <p key="info-1">
                <strong className="text-foreground/75">Name:</strong> To address
                you properly in our communications.
            </p>,
            <p key="info-2">
                <strong className="text-foreground/75">Email Address:</strong>{" "}
                To respond to your inquiry.
            </p>,
            <p key="info-3">
                <strong className="text-foreground/75">
                    Message/Inquiry Content:
                </strong>{" "}
                To understand and respond effectively to your request.
            </p>,
            <p key="info-4">
                <strong className="text-foreground/75">
                    IP Address and Browser Information:
                </strong>{" "}
                Automatically collected to help us understand usage patterns and
                for security purposes (if applicable).
            </p>,
        ],
    },
    {
        title: "How We Use Your Information",
        body: "We use the information you provide for the following purposes:",
        points: [
            <p key="use-1">
                <strong className="text-foreground/75">
                    Responding to Inquiries:
                </strong>{" "}
                To communicate with you about your web development inquiry.
            </p>,
            <p key="use-2">
                <strong className="text-foreground/75">Form Processing:</strong>{" "}
                To deliver structured voice-to-form submissions.
            </p>,
            <p key="use-3">
                <strong className="text-foreground/75">Record Keeping:</strong>{" "}
                To manage inquiries and maintain logs for accountability and
                improvement.
            </p>,
            <p key="use-4">
                <strong className="text-foreground/75">Security:</strong> To
                help detect and prevent fraudulent activities and other security
                issues.
            </p>,
            <p key="use-5">
                <strong className="text-foreground/75">
                    Legal Compliance:
                </strong>{" "}
                To comply with applicable laws and regulations.
            </p>,
        ],
    },
    {
        title: "Data Storage and Security",
        body: `All data is stored securely in our managed Supabase Postgres database. We do not store any audio recordings. We apply best-practice security measures to protect your data from unauthorized access, and access is restricted to operational personnel only. Data is retained as long as necessary to fulfill the purposes of this policy or as required by law.`,
    },
    {
        title: "Third-Party Services",
        body: `We may use third-party providers for infrastructure, analytics, or email communications. These services may have their own privacy policies, and by using Claimified, you also agree to those terms. We only work with providers that meet our security and compliance standards.`,
    },
    {
        title: "Your Rights",
        body: "Depending on your jurisdiction, you may have the following rights concerning your personal data:",
        points: [
            <p key="rights-1">
                <strong className="text-foreground/75">Access:</strong> You may
                request copies of your personal data.
            </p>,
            <p key="rights-2">
                <strong className="text-foreground/75">Correction:</strong> You
                may request that we correct any inaccurate or incomplete data.
            </p>,
            <p key="rights-3">
                <strong className="text-foreground/75">Deletion:</strong> You
                may request that we delete your personal data, subject to
                certain exceptions.
            </p>,
            <p key="rights-4">
                <strong className="text-foreground/75">Restriction:</strong> You
                may request that we restrict the processing of your personal
                data.
            </p>,
            <p key="rights-5">
                <strong className="text-foreground/75">
                    Data Portability:
                </strong>{" "}
                You may request to receive your personal data in a structured,
                commonly used, and machine-readable format.
            </p>,
        ],
    },
    {
        title: "Changes to This Privacy Policy",
        body: `We may update this Privacy Policy occasionally. When we do, we'll revise the "Effective Date" above. Continued use after changes constitutes acceptance of the updated policy.`,
    },
    {
        title: "Contact Us",
        body: "If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:",
        points: [
            <p key="contact-1">
                <strong className="text-foreground/75">Email:</strong>{" "}
                hello@korijacobsen.au
            </p>,
        ],
    },
];

const PrivacyPolicy = () => {
    return (
        <div className="-mt-24 sm:-mt-32 lg:-mt-40 lg:pt-40 sm:pt-32 pt-24">
            <PolicyWrapper
                title={"Privacy Policy"}
                effectiveDate={"Sun June 11 2025"}
                sections={privacyPolicySections}
            />
        </div>
    );
};

export default PrivacyPolicy;
