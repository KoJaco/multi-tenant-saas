import { Link, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Container } from "~/components/ui/container";
import { getAppName } from "~/lib/branding.server";

export async function loader() {
    return {
        appName: getAppName(),
    };
}

export default function AuthLayout() {
    const { appName } = useLoaderData<typeof loader>();
    
    return (
        <div>
            <header className="absolute top-0 left-0 z-50 w-full">
                <Container className="py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {appName}
                        </div>
                        <Link to="/">← home</Link>
                    </div>
                </Container>
            </header>
            <Outlet />
        </div>
    );
}
