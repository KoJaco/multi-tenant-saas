import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

export async function loader({ request }: LoaderFunctionArgs) {
    const { requirePermission } = await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(request, "billing", "retrieve");

    return {
        appUser,
        subscription: {
            status: "free",
            plan: "Free",
            usage: {
                apiCalls: 0,
                apiCallsLimit: 1000,
            },
        },
    };
}

export default function BillingPage() {
    const { subscription } = useLoaderData<typeof loader>();

    return (
        <div className="w-full space-y-6 mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Billing & Usage</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your plan and usage here.
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Current Plan Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Current Plan
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground/90">
                                        Plan
                                    </label>
                                    <p className="mt-1 text-sm text-foreground/50 capitalize">
                                        {subscription.plan}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground/90">
                                        Status
                                    </label>
                                    <p className="mt-1 text-sm text-foreground/50 capitalize">
                                        {subscription.status}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Usage Statistics Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Usage Statistics
                            </h4>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-medium text-foreground/90">
                                            Forms
                                        </label>
                                        <span className="text-sm text-foreground/50">
                                            2 / 5
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-medium text-foreground/90">
                                            API Calls
                                        </label>
                                        <span className="text-sm text-foreground/50">
                                            {subscription.usage.apiCalls} /{" "}
                                            {subscription.usage.apiCallsLimit}
                                        </span>
                                    </div>
                                    <div className="w-full bg-primary rounded-full h-2.5">
                                        <div
                                            className="bg-primary h-2.5 rounded-full"
                                            style={{
                                                width: `${
                                                    (subscription.usage
                                                        .apiCalls /
                                                        subscription.usage
                                                            .apiCallsLimit) *
                                                    100
                                                }%`,
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="button" variant="default" className="rounded-lg">
                    Upgrade Plan
                </Button>
            </div>
        </div>
    );
}
