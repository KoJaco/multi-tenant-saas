import { Form, Link, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { User } from "@supabase/supabase-js";
import { ModeToggle } from "~/components/mode-toggle";
import { Button } from "~/components/ui/button";
import { Badge } from "./ui/badge";
import { Bell } from "lucide-react";

interface UserMenuProps {
    user: User;
}

export function UserMenu({ user }: UserMenuProps) {
    const countFetcher = useFetcher<{ count: number }>();
    const [unreadCount, setUnreadCount] = useState(0);

    // Fetch unread count on mount and periodically
    useEffect(() => {
        countFetcher.load("/api/notifications?intent=count");

        // Refresh count every 30 seconds
        const interval = setInterval(() => {
            countFetcher.load("/api/notifications?intent=count");
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (countFetcher.data?.count !== undefined) {
            setUnreadCount(countFetcher.data.count);
        }
    }, [countFetcher.data]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-7 w-7 rounded-full"
                >
                    <span className="sr-only">Open user menu</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/25">
                        {user.email?.[0]?.toUpperCase() || "U"}
                    </div>
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] border-2 border-background"
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-56 bg-background/75 backdrop-blur-lg"
                align="end"
                forceMount
            >
                <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                        <p className="font-medium">{user.email}</p>
                    </div>
                </div>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex items-center justify-between">
                    <span>Theme</span>
                    <ModeToggle />
                </div>
                <DropdownMenuSeparator />
                <div className="px-1 py-1">
                    <Link
                        to="/dashboard/account/notifications"
                        className="flex items-center gap-2 py-2 px-1 rounded-sm hover:bg-primary/25 cursor-pointer transition-colors duration-300 text-sm w-full"
                    >
                        <Bell className="h-4 w-4" />
                        <span>Notifications</span>
                        {unreadCount > 0 && (
                            <Badge
                                variant="destructive"
                                className="ml-auto flex"
                            >
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </Badge>
                        )}
                    </Link>
                    {/* <NotificationsPopover unreadCount={unreadCount} /> */}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    asChild
                    className="rounded-sm hover:bg-primary/25 cursor-pointer transition-colors duration-300"
                >
                    <Link to="/dashboard/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    asChild
                    className="rounded-sm hover:bg-primary/25 cursor-pointer transition-colors duration-300"
                >
                    <Link to="/dashboard/account">Account</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    asChild
                    className="rounded-sm hover:bg-primary/25 cursor-pointer transition-colors duration-300"
                >
                    <Form action="/logout" method="post">
                        <button type="submit" className="w-full text-left">
                            Log out
                        </button>
                    </Form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
