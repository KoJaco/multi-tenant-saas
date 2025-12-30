/**
 * Notifications Page
 *
 * Table-based view of all notifications with filtering and sorting.
 */

import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
    useLoaderData,
    Form,
    Link,
    useNavigation,
} from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Check, X, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createErrorResponse } = await import("~/lib/errors.server");
    const { getUserNotifications } = await import("~/lib/notifications/server");
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);
            const url = new URL(request.url);

            const readFilter = url.searchParams.get("read");
            const typeFilter = url.searchParams.get("type");
            const sortBy = url.searchParams.get("sortBy") || "createdAt";
            const sortOrder = url.searchParams.get("sortOrder") || "desc";

            const validTypes = [
                "info",
                "success",
                "warning",
                "error",
                "critical",
            ] as const;

            const typeFilterType =
                typeFilter &&
                validTypes.includes(typeFilter as (typeof validTypes)[number])
                    ? (typeFilter as (typeof validTypes)[number])
                    : undefined;

            const notifications = await getUserNotifications({
                accountId: appUser.accountId,
                userId: appUser.id,
                read:
                    readFilter === "true"
                        ? true
                        : readFilter === "false"
                          ? false
                          : undefined,
                type: typeFilter as typeof typeFilterType,
                limit: 100,
            });

            // Sort notifications
            const sorted = [...notifications].sort((a, b) => {
                const aValue =
                    sortBy === "readAt" ? a.readAt || a.createdAt : a.createdAt;
                const bValue =
                    sortBy === "readAt" ? b.readAt || b.createdAt : b.createdAt;

                if (sortOrder === "asc") {
                    return (
                        new Date(aValue).getTime() - new Date(bValue).getTime()
                    );
                } else {
                    return (
                        new Date(bValue).getTime() - new Date(aValue).getTime()
                    );
                }
            });

            return {
                notifications: sorted,
                filters: {
                    read: readFilter,
                    type: typeFilter,
                    sortBy,
                    sortOrder,
                },
            };
        } catch (error) {
            return createErrorResponse(
                error,
                "Failed to load notifications",
                500
            );
        }
    });
}

export async function action({ request }: ActionFunctionArgs) {
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createErrorResponse } = await import("~/lib/errors.server");
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);
            const formData = await request.formData();
            const intent = formData.get("intent");

            if (intent === "mark-all-read") {
                const { markAllNotificationsRead } =
                    await import("~/lib/notifications/server");
                await markAllNotificationsRead(appUser.accountId, appUser.id);
                return { success: true };
            }

            if (intent === "mark-read") {
                const notificationId = formData.get("notificationId");
                if (!notificationId || typeof notificationId !== "string") {
                    return createErrorResponse(
                        new Error("Notification ID is required"),
                        "Notification ID is required",
                        400
                    );
                }

                const { markNotificationRead } =
                    await import("~/lib/notifications/server");
                await markNotificationRead(
                    notificationId,
                    appUser.id,
                    appUser.accountId
                );
                return { success: true };
            }

            if (intent === "mark-unread") {
                const notificationId = formData.get("notificationId");
                if (!notificationId || typeof notificationId !== "string") {
                    return createErrorResponse(
                        new Error("Notification ID is required"),
                        "Notification ID is required",
                        400
                    );
                }

                const { markNotificationUnread } =
                    await import("~/lib/notifications/server");
                await markNotificationUnread(
                    notificationId,
                    appUser.id,
                    appUser.accountId
                );
                return { success: true };
            }

            return { success: false };
        } catch (error) {
            return createErrorResponse(error, "Failed to process action", 500);
        }
    });
}

const typeColors = {
    info: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
    critical: "bg-red-600",
};

const typeLabels = {
    info: "Info",
    success: "Success",
    warning: "Warning",
    error: "Error",
    critical: "Critical",
};

export default function NotificationsPage() {
    const { notifications, filters } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const [readFilter, setReadFilter] = useState(filters.read || "all");
    const [typeFilter, setTypeFilter] = useState(filters.type || "all");
    const [sortBy, setSortBy] = useState(filters.sortBy || "createdAt");
    const [sortOrder, setSortOrder] = useState(filters.sortOrder || "desc");

    // Refresh page after actions
    useEffect(() => {
        if (navigation.state === "idle" && navigation.formMethod === "POST") {
            window.location.reload();
        }
    }, [navigation.state, navigation.formMethod]);

    const buildUrl = (params: Record<string, string>) => {
        const searchParams = new URLSearchParams();
        if (params.read && params.read !== "all")
            searchParams.set("read", params.read);
        if (params.type && params.type !== "all")
            searchParams.set("type", params.type);
        if (params.sortBy) searchParams.set("sortBy", params.sortBy);
        if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
        return `/dashboard/account/notifications${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="w-full space-y-6 mt-12 md:mt-0">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-medium">Notifications</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your account notifications
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Form method="post">
                        <input
                            type="hidden"
                            name="intent"
                            value="mark-all-read"
                        />
                        <Button type="submit" variant="outline" size="sm">
                            Mark all as read
                        </Button>
                    </Form>
                )}
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Filters Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Filters
                            </h4>
                            <div className="flex items-center gap-2">
                                <Select
                                    value={readFilter}
                                    onValueChange={(value) => {
                                        setReadFilter(value);
                                        window.location.href = buildUrl({
                                            read: value,
                                            type: typeFilter,
                                            sortBy,
                                            sortOrder,
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Filter by read" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="true">
                                            Read
                                        </SelectItem>
                                        <SelectItem value="false">
                                            Unread
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={typeFilter}
                                    onValueChange={(value) => {
                                        setTypeFilter(value);
                                        window.location.href = buildUrl({
                                            read: readFilter,
                                            type: value,
                                            sortBy,
                                            sortOrder,
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Filter by type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All Types
                                        </SelectItem>
                                        <SelectItem value="info">
                                            Info
                                        </SelectItem>
                                        <SelectItem value="success">
                                            Success
                                        </SelectItem>
                                        <SelectItem value="warning">
                                            Warning
                                        </SelectItem>
                                        <SelectItem value="error">
                                            Error
                                        </SelectItem>
                                        <SelectItem value="critical">
                                            Critical
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={`${sortBy}-${sortOrder}`}
                                    onValueChange={(value) => {
                                        const [newSortBy, newSortOrder] =
                                            value.split("-");
                                        setSortBy(newSortBy);
                                        setSortOrder(newSortOrder);
                                        window.location.href = buildUrl({
                                            read: readFilter,
                                            type: typeFilter,
                                            sortBy: newSortBy,
                                            sortOrder: newSortOrder,
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Sort by" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="createdAt-desc">
                                            Newest First
                                        </SelectItem>
                                        <SelectItem value="createdAt-asc">
                                            Oldest First
                                        </SelectItem>
                                        <SelectItem value="readAt-desc">
                                            Recently Read
                                        </SelectItem>
                                        <SelectItem value="readAt-asc">
                                            Oldest Read
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Notifications Table Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                All Notifications ({notifications.length})
                            </h4>
                        </div>
                    </div>
                    {/* Table extends to card border */}
                    {notifications.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-muted-foreground">
                                No notifications found
                            </p>
                        </div>
                    ) : (
                        <Table className="border rounded-lg">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        Type
                                    </TableHead>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Message</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="w-[100px]">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {notifications.map((notification) => (
                                    <TableRow
                                        key={notification.id}
                                        className={
                                            notification.read
                                                ? "opacity-60"
                                                : ""
                                        }
                                    >
                                        <TableCell>
                                            <div
                                                className={`h-3 w-3 rounded-full ${typeColors[notification.type]}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {notification.title}
                                        </TableCell>
                                        <TableCell className="max-w-md">
                                            <p className="truncate text-sm text-muted-foreground">
                                                {notification.message}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    notification.read
                                                        ? "secondary"
                                                        : "default"
                                                }
                                            >
                                                {notification.read
                                                    ? "Read"
                                                    : "Unread"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(
                                                notification.createdAt
                                            ).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {notification.actionUrl && (
                                                    <Link
                                                        to={
                                                            notification.actionUrl
                                                        }
                                                        className="p-1 hover:bg-muted rounded"
                                                        title="View"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Link>
                                                )}
                                                <Form method="post">
                                                    <input
                                                        type="hidden"
                                                        name="intent"
                                                        value={
                                                            notification.read
                                                                ? "mark-unread"
                                                                : "mark-read"
                                                        }
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="notificationId"
                                                        value={notification.id}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        title={
                                                            notification.read
                                                                ? "Mark as unread"
                                                                : "Mark as read"
                                                        }
                                                    >
                                                        {notification.read ? (
                                                            <X className="h-4 w-4" />
                                                        ) : (
                                                            <Check className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </Form>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
