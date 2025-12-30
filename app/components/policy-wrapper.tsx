import { Fader } from "./fader";
import { PageIntro } from "./sections/page-intro";
import { Container } from "./ui/container";

type Props = {
    title: string | React.ReactNode;
    effectiveDate: string;
    sections: { title: string; body?: string; points?: React.ReactNode[] }[];
};

const PolicyWrapper = ({ title, effectiveDate, sections }: Props) => {
    return (
        <div className="max-w-xl mx-auto">
            <PageIntro eyebrow={""} title={title}>
                <span className="text-sm">
                    <em>Effective Date: {effectiveDate}</em>
                </span>
            </PageIntro>
            <Container className="my-10 text-left max-w-xl mx-auto">
                <Fader className="flex flex-col gap-8">
                    {sections.map((section, index) => (
                        <div key={index} className="text-foreground/50">
                            <h2 className="text-lg text-foreground/90 font-semibold">
                                {section.title}
                            </h2>
                            <p className="mt-4">{section?.body}</p>
                            <ul className="ml-4 list-disc mt-2">
                                {section.points?.map((point, index) => (
                                    <li key={`${point}-${index}`}>{point}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </Fader>
            </Container>
        </div>
    );
};

export default PolicyWrapper;
