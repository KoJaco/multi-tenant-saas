import PolicyWrapper from "~/components/policy-wrapper";

const termsOfServiceSections = [
    {
        title: "Introduction",
        body: ` 

These Terms of Service ("Terms") govern your access to and use of the Claimified voice-enabled form filler application ("Service"). By using the Service, you agree to these Terms.`,
    },
    {
        title: "Use of the Service",
        body: "You may use the Service only in accordance with these Terms and all applicable laws. You agree not to misuse the Service or attempt to interfere with its normal operation.",
    },
    {
        title: "Account",
        body: "To access certain features, you may need to create an account. You must provide accurate information and are responsible for safeguarding your account credentials.",
    },
    {
        title: "Data Collection and Privacy",
        body: `By using the Service, you agree to our Privacy Policy. We do not store any audio data. However, we store text transcripts, session metadata, and contact inquiries submitted through our forms. These are used to enhance service functionality and support communication.`,
    },
    {
        title: "Intellectual Property",
        body: `All intellectual property associated with Claimified, including software, branding, and content, is owned by Kori Jacobsen or its licensors. You may not copy, modify, distribute, or reverse engineer any part of the Service.`,
    },
    {
        title: "Restrictions",
        body: "You agree not to:",
        points: [
            <p key="restrictions-1">
                Use the Service for any unlawful purpose.
            </p>,
            <p key="restrictions-2">Attempt unauthorized access to systems.</p>,
            <p key="restrictions-3">
                Disrupt the operation or integrity of the Service.
            </p>,
        ],
    },
    {
        title: "Termination",
        body: `We reserve the right to suspend or terminate your access to the Service at any time, with or without cause or notice.`,
    },
    {
        title: "Disclaimer",
        body: "The Service is provided 'as is' without warranties of any kind. We do not guarantee that the Service will be error-free or available at all times.",
    },
    {
        title: "Limitation of Liability",
        body: "To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the Service.",
    },
    {
        title: "Change to Terms",
        body: "We may update these Terms from time to time. Continued use of the Service after changes are posted constitutes your acceptance.",
    },
    {
        title: "Contact Us",
        body: "If you have any questions or concerns about these terms, contact:",
        points: [
            <p key="contact-1">
                <strong className="text-foreground/75">Email:</strong>{" "}
                hello@korijacobsen.au
            </p>,
        ],
    },
];

const TermsOfService = () => {
    return (
        <div className="-mt-24 sm:-mt-32 lg:-mt-40 lg:pt-40 sm:pt-32 pt-24">
            <PolicyWrapper
                title={"Terms of Service"}
                effectiveDate={"Sun June 11 2025"}
                sections={termsOfServiceSections}
            />
        </div>
    );
};

export default TermsOfService;
