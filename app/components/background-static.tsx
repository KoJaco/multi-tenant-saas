import clsx from "clsx";

type Props = {
    className?: string;
    bgSize?: string;
};

const BackgroundStatic = ({ className, bgSize = "82px" }: Props) => {
    return (
        <div
            style={{ backgroundSize: bgSize }}
            className={clsx(
                "bg-repeat bg-static bg-transparent bg-[length:80px_80px] absolute rounded-none w-full opacity-[0.06] h-full -z-5 pointer-events-none inset-0",
                className
            )}
        />
    );
};

export default BackgroundStatic;
