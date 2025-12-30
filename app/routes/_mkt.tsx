import { Outlet } from "react-router";
import { Footer } from "~/components/sections/footer";

export default function Index() {
    return (
        <>
            <Outlet />

            <Footer />
        </>
    );
}
