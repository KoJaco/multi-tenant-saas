import { Link, Outlet } from "react-router";
import { ArrowLeft } from "lucide-react";
import BackgroundStatic from "~/components/background-static";
import { Fader } from "~/components//fader";

const PoliciesLayout = () => {
    return (
        <div className="relative h-full w-full">
            <BackgroundStatic />

            {/* Mobile */}

            <header className="flex w-full h-[70px] items-center lg:hidden sticky top-0 backdrop-blur ">
                <div className="max-w-xl mx-auto w-full px-5">
                    <Fader className="flex w-full justify-between">
                        <span className="text-xl text-foreground mb-2">
                            Claimified
                        </span>

                        <Link
                            to="/"
                            className="flex gap-x-1 items-center text-foreground/50 hover:text-foreground transition-colors duration-300"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Home
                        </Link>
                    </Fader>
                </div>
            </header>

            {/* Desktop  */}
            <div className="max-w-[160px] text-sm gap-y-2 flex-col text-foreground/50 lg:flex hidden transition-opacity duration-300 fixed left-10 top-40 group/nav">
                <Fader>
                    <span className="text-xl text-foreground mb-2">
                        Claimified
                    </span>
                    <p className="text-md mb-4">
                        Structured output, <br />
                        powerful natural language
                    </p>

                    <Link
                        to="/"
                        className="flex gap-x-1 items-center text-foreground/50 hover:text-foreground transition-colors duration-300"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Home
                    </Link>
                </Fader>
            </div>

            <Outlet />
        </div>
    );
};

export default PoliciesLayout;
