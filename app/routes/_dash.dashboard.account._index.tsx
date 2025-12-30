import { type LoaderFunctionArgs, useLoaderData, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { accounts } from "~/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export async function loader({ request }: LoaderFunctionArgs) {
    // server imports
    const { db } = await import("~/lib/db/index.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { hasPermission } = await import("~/lib/permissions.server");
    const { appUser } = await requireUser(request);

    // Check if user has permission to view account details
    const canViewAccount = await hasPermission(
        appUser.id,
        "account",
        "retrieve"
    );

    // TODO: is this the best flow?

    // If user doesn't have permission, redirect to user settings
    if (!canViewAccount) {
        throw redirect("/dashboard/settings");
    }

    const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, appUser.accountId));

    return { account };
}

const AccountOverviewPage = () => {
    const { account } = useLoaderData<typeof loader>();

    return (
        <div className="w-full">
            <div className="mb-6">
                <h2 className="text-2xl font-medium">Account Overview</h2>
                <p className="text-sm text-muted-foreground">
                    Checkout all your account information here.
                </p>
            </div>

            <Card>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="block text-sm font-medium text-foreground/90">
                            Account ID
                        </h3>
                        <p className="mt-1 text-sm text-foreground/50">
                            {account.id}
                        </p>
                    </div>

                    <div>
                        <h3 className="block text-sm font-medium text-foreground/90">
                            Account Name
                        </h3>
                        <p className="mt-1 text-sm text-foreground/50">
                            {account.name}
                        </p>
                    </div>

                    <div>
                        <h3 className="block text-sm font-medium text-foreground/90">
                            Account Created
                        </h3>
                        <p className="mt-1 text-sm text-foreground/50">
                            {new Date(account.createdAt).toLocaleDateString()}
                        </p>
                    </div>

                    <div>
                        <h3 className="block text-sm font-medium text-foreground/90">
                            Last Updated
                        </h3>
                        <p className="mt-1 text-sm text-foreground/50">
                            {new Date(account.updatedAt).toLocaleDateString()}
                        </p>
                    </div>

                    <div>
                        <h3 className="block text-sm font-medium text-foreground/90">
                            Plan
                        </h3>
                        <p className="mt-1 text-sm text-foreground/50">
                            {account.plan}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AccountOverviewPage;
