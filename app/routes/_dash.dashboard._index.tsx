import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { Card, CardContent } from "~/components/ui/card";

export async function loader({ request }: LoaderFunctionArgs) {
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { authUser } = await requireUser(request);

    return {
        authUser,
    };
}

export default function DashboardIndex() {
    const { authUser } = useLoaderData<typeof loader>();

    return (
        <div className="w-full space-y-6 mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Dashboard</h3>
                <p className="text-sm text-muted-foreground">
                    Welcome back, {authUser.email}
                </p>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="bg-muted dark:bg-muted/20 flex-1 w-full h-full min-h-[800px] items-center flex justify-center">
                        <p>Add whatever I guess</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
