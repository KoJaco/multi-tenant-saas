import {
    type LoaderFunctionArgs,
    useLocation,
    Link,
    Outlet,
    useLoaderData,
} from "react-router";
import { cn } from "~/lib/utils";
import {
    Home,
    Settings as SettingsIcon,
    CreditCard,
    Users as UsersIcon,
    Shield,
    Key,
    UserPlus,
    User,
    Bell,
    ShieldCheck,
    Crown,
    FileText,
} from "lucide-react";
import { accounts } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { hasPermission } = await import("~/lib/permissions.server");
    const { appUser } = await requireUser(request);

    const account = await db.query.accounts.findFirst({
        where: eq(accounts.id, appUser.accountId),
    });

    // Check permissions for navigation items
    const [
        canViewAccount,
        canViewUsers,
        canViewRoles,
        canViewPermissions,
        canViewInvitations,
        canViewBilling,
        canViewAuditLogs,
    ] = await Promise.all([
        hasPermission(appUser.id, "account", "retrieve"),
        hasPermission(appUser.id, "users", "retrieve"),
        hasPermission(appUser.id, "roles", "retrieve"),
        hasPermission(appUser.id, "permissions", "retrieve"),
        hasPermission(appUser.id, "users", "create"), // Invitations require create permission
        hasPermission(appUser.id, "billing", "retrieve"),
        hasPermission(appUser.id, "audit_logs", "retrieve"),
    ]);

    return {
        appUser,
        account,
        permissions: {
            canViewAccount,
            canViewUsers,
            canViewRoles,
            canViewPermissions,
            canViewInvitations,
            canViewBilling,
            canViewAuditLogs,
        },
    };
}

export default function AccountPage() {
    const { appUser, account, permissions } = useLoaderData<typeof loader>();
    const location = useLocation();

    // Personal section - always visible
    const personalItems = [
        {
            name: "Profile",
            href: "/dashboard/profile",
            Icon: User,
        },
        {
            name: "Settings",
            href: "/dashboard/settings",
            Icon: SettingsIcon,
        },
        {
            name: "Security",
            href: "/dashboard/settings/security",
            Icon: ShieldCheck,
        },
        {
            name: "Notifications",
            href: "/dashboard/account/notifications",
            Icon: Bell,
        },
    ];

    // Account Management section - conditional
    const accountItems = [];
    if (permissions.canViewAccount) {
        accountItems.push({
            name: "Account Overview",
            href: "/dashboard/account",
            Icon: Home,
        });
        accountItems.push({
            name: "Account Settings",
            href: "/dashboard/account/settings",
            Icon: SettingsIcon,
        });
    }
    if (permissions.canViewAuditLogs) {
        accountItems.push({
            name: "Audit Logs",
            href: "/dashboard/account/audit-logs",
            Icon: FileText,
        });
    }
    if (permissions.canViewBilling) {
        accountItems.push({
            name: "Account Billing",
            href: "/dashboard/account/billings",
            Icon: CreditCard,
        });
    }

    // Administration section - conditional
    const adminItems = [];
    if (permissions.canViewUsers) {
        adminItems.push({
            name: "Users",
            href: "/dashboard/account/users",
            Icon: UsersIcon,
        });
    }
    if (permissions.canViewRoles) {
        adminItems.push({
            name: "Roles",
            href: "/dashboard/account/roles",
            Icon: Shield,
        });
    }
    if (permissions.canViewPermissions) {
        adminItems.push({
            name: "Permissions",
            href: "/dashboard/account/permissions",
            Icon: Key,
        });
    }
    if (permissions.canViewInvitations) {
        adminItems.push({
            name: "Invitations",
            href: "/dashboard/account/invitations",
            Icon: UserPlus,
        });
    }
    // Ownership is owner-only
    if (appUser.role === "owner") {
        adminItems.push({
            name: "Ownership",
            href: "/dashboard/account/ownership",
            Icon: Crown,
        });
    }

    const navigationGroups: Array<{
        items: Array<{
            name: string;
            href: string;
            Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        }>;
    }> = [];

    // Only add groups that have items
    if (personalItems.length > 0) {
        navigationGroups.push({ items: personalItems });
    }
    if (accountItems.length > 0) {
        navigationGroups.push({ items: accountItems });
    }
    if (adminItems.length > 0) {
        navigationGroups.push({ items: adminItems });
    }

    return (
        <div>
            <div className="mt-6 flex flex-col md:flex-row relative">
                <div className="absolute inset-x-0 left-0 top-1/4 -z-10 transform-gpu overflow-hidden opacity-50 blur-3xl">
                    <div className="ml-[max(50%,0rem)] aspect-[1313/771] w-[40.0625rem] bg-gradient-to-tr from-primary to-[#9089fc] opacity-10"></div>
                </div>
                {/* Sidebar Navigation */}
                <div className="w-full md:max-w-[200px] flex flex-col gap-y-4 pb-3 h-full">
                    <div className="flex flex-col gap-y-2 w-full">
                        <div className="flex flex-col gap-y-2">
                            <h1 className="text-md text-foreground/75">
                                {appUser.role}
                            </h1>
                            <div className="text-foreground/50 text-sm flex gap-x-1">
                                <span>{account?.plan}</span> -
                                <span>{appUser.email}</span>
                            </div>
                        </div>
                    </div>
                    <nav className="flex gap-x-1 flex-col gap-y-1 flex-1 h-full">
                        {navigationGroups.map((group, gi) => (
                            <div key={gi} className={cn("pb-2 mb-2 border-b")}>
                                {group.items.map((item) => (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        className={cn(
                                            "flex items-center py-2 px-2 text-sm font-medium rounded-sm w-full mb-0.5",
                                            location.pathname === item.href
                                                ? "bg-foreground/5 text-foreground font-semibold"
                                                : "text-foreground/50 hover:bg-foreground/5"
                                        )}
                                    >
                                        <item.Icon className="h-4 w-4 mr-2" />
                                        {item.name}
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex w-full md:pl-12 overflow-x-hidden">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
