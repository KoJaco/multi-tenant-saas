import {
    useLoaderData,
    useSearchParams,
    useNavigate,
    type LoaderFunctionArgs,
} from "react-router";
import { auditLogs, users } from "~/lib/db/schema";
import { eq, and, desc, asc, sql, ilike } from "drizzle-orm";
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
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { FileText, ArrowUpDown, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";

export async function loader({ request }: LoaderFunctionArgs) {
    const { db } = await import("~/lib/db/index.server");
    const { requirePermission } = await import("~/lib/permissions.server");
    const { appUser } = await requirePermission(
        request,
        "audit_logs",
        "retrieve"
    );

    const url = new URL(request.url);
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";
    const filterEntityParam = url.searchParams.get("entity");
    const filterEntity =
        filterEntityParam && filterEntityParam !== "all"
            ? filterEntityParam
            : "";
    const filterActionParam = url.searchParams.get("action");
    const filterAction =
        filterActionParam && filterActionParam !== "all"
            ? filterActionParam
            : "";
    const filterActor = url.searchParams.get("actor") || "";

    // Build where conditions
    const conditions = [eq(auditLogs.accountId, appUser.accountId)];

    if (filterEntity) {
        conditions.push(eq(auditLogs.targetType, filterEntity));
    }

    if (filterAction) {
        conditions.push(ilike(auditLogs.action, `%${filterAction}%`));
    }

    if (filterActor) {
        // Join with users table to filter by actor email
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM ${users} 
                WHERE ${users.id} = ${auditLogs.actorUserId} 
                AND LOWER(${users.email}) LIKE LOWER(${`%${filterActor}%`})
            )`
        );
    }

    // Build order by - validate sortBy is a valid column
    const validSortColumns = ["createdAt", "action", "targetType"] as const;
    const safeSortBy = validSortColumns.includes(
        sortBy as (typeof validSortColumns)[number]
    )
        ? (sortBy as (typeof validSortColumns)[number])
        : "createdAt";

    const orderBy =
        sortOrder === "asc"
            ? asc(auditLogs[safeSortBy])
            : desc(auditLogs[safeSortBy]);

    // Get audit logs with actor user info
    const logs = await db
        .select({
            id: auditLogs.id,
            actorUserId: auditLogs.actorUserId,
            actorEmail: users.email,
            action: auditLogs.action,
            targetType: auditLogs.targetType,
            targetId: auditLogs.targetId,
            changes: auditLogs.changes,
            metadata: auditLogs.metadata,
            ipAddress: auditLogs.ipAddress,
            userAgent: auditLogs.userAgent,
            createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(500); // Limit to prevent performance issues

    // Get unique entities and actions for filters
    const entityStats = await db
        .select({
            targetType: auditLogs.targetType,
            count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(eq(auditLogs.accountId, appUser.accountId))
        .groupBy(auditLogs.targetType);

    const actionStats = await db
        .select({
            action: auditLogs.action,
            count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(eq(auditLogs.accountId, appUser.accountId))
        .groupBy(auditLogs.action)
        .orderBy(desc(sql`count(*)`))
        .limit(50);

    return {
        logs,
        entityStats,
        actionStats,
        currentFilters: {
            sortBy,
            sortOrder,
            filterEntity,
            filterAction,
            filterActor,
        },
    };
}

export default function AuditLogsPage() {
    const { logs, entityStats, actionStats, currentFilters } =
        useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [localFilters, setLocalFilters] = useState({
        entity: currentFilters.filterEntity || "all",
        action: currentFilters.filterAction || "all",
        actor: currentFilters.filterActor,
    });
    const [selectedLog, setSelectedLog] = useState<
        (typeof logs)[0] | null
    >(null);

    const handleSort = (column: string) => {
        const currentSortBy = searchParams.get("sortBy") || "createdAt";
        const currentSortOrder = searchParams.get("sortOrder") || "desc";

        const newSortOrder =
            currentSortBy === column && currentSortOrder === "desc"
                ? "asc"
                : "desc";

        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.set("sortBy", column);
            newParams.set("sortOrder", newSortOrder);
            return newParams;
        });
    };

    const handleFilterChange = (key: string, value: string) => {
        setLocalFilters((prev) => ({ ...prev, [key]: value }));
    };

    const applyFilters = () => {
        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            if (localFilters.entity && localFilters.entity !== "all") {
                newParams.set("entity", localFilters.entity);
            } else {
                newParams.delete("entity");
            }
            if (localFilters.action && localFilters.action !== "all") {
                newParams.set("action", localFilters.action);
            } else {
                newParams.delete("action");
            }
            if (localFilters.actor) {
                newParams.set("actor", localFilters.actor);
            } else {
                newParams.delete("actor");
            }
            return newParams;
        });
    };

    const clearFilters = () => {
        setLocalFilters({ entity: "all", action: "all", actor: "" });
        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("entity");
            newParams.delete("action");
            newParams.delete("actor");
            return newParams;
        });
    };

    const getSortIcon = (column: string) => {
        const currentSortBy = searchParams.get("sortBy") || "createdAt";
        const currentSortOrder = searchParams.get("sortOrder") || "desc";

        if (currentSortBy !== column) {
            return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
        }

        return currentSortOrder === "desc" ? (
            <ArrowDown className="h-4 w-4 ml-1" />
        ) : (
            <ArrowUp className="h-4 w-4 ml-1" />
        );
    };

    const formatAction = (action: string) => {
        const parts = action.split(".");
        if (parts.length === 2) {
            return (
                <span>
                    <span className="font-medium">{parts[0]}</span>.
                    <span className="text-muted-foreground">{parts[1]}</span>
                </span>
            );
        }
        return action;
    };

    const formatJSON = (obj: unknown): string => {
        if (obj === null || obj === undefined) return "null";
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    };

    const hasDetails = (log: (typeof logs)[0]) => {
        return (
            log.targetId ||
            (log.changes && Object.keys(log.changes).length > 0) ||
            (log.metadata && Object.keys(log.metadata).length > 0) ||
            log.ipAddress ||
            log.userAgent
        );
    };

    const getDetailsPreview = (log: (typeof logs)[0]) => {
        const parts: string[] = [];
        if (log.targetId) parts.push(`ID: ${log.targetId}`);
        if (log.changes && Object.keys(log.changes).length > 0) {
            parts.push(`${Object.keys(log.changes).length} change(s)`);
        }
        if (log.metadata && Object.keys(log.metadata).length > 0) {
            parts.push(`${Object.keys(log.metadata).length} metadata field(s)`);
        }
        if (log.ipAddress) parts.push(`IP: ${log.ipAddress}`);
        return parts.length > 0 ? parts.join(" • ") : "No details";
    };

    return (
        <div className="space-y-6 w-full mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Audit Logs</h3>
                <p className="text-sm text-muted-foreground">
                    View account activity and changes
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Filters Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Filters
                            </h4>
                            <p className="text-sm text-muted-foreground mb-4">
                                Filter audit logs by entity, action, or actor
                            </p>
                            <div className="flex gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="entity">Entity</Label>
                                    <Select
                                        value={localFilters.entity}
                                        onValueChange={(value) =>
                                            handleFilterChange("entity", value)
                                        }
                                    >
                                        <SelectTrigger id="entity">
                                            <SelectValue placeholder="All entities" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">
                                                All entities
                                            </SelectItem>
                                            {entityStats.map((stat) => (
                                                <SelectItem
                                                    key={stat.targetType}
                                                    value={stat.targetType}
                                                >
                                                    {stat.targetType} (
                                                    {stat.count})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2 flex-1">
                                    <Label htmlFor="actor">Actor Email</Label>
                                    <Input
                                        id="actor"
                                        placeholder="Filter by actor email..."
                                        value={localFilters.actor}
                                        onChange={(e) =>
                                            handleFilterChange(
                                                "actor",
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>

                                <div className="flex items-end gap-2">
                                    <Button
                                        onClick={applyFilters}
                                        className="flex-1"
                                    >
                                        Apply Filters
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={clearFilters}
                                        disabled={
                                            !localFilters.entity &&
                                            !localFilters.action &&
                                            !localFilters.actor
                                        }
                                    >
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Table extends to card border */}
                    <Table className="w-full border rounded-lg">
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSort("createdAt")}
                                        className="h-auto p-0 font-semibold"
                                    >
                                        Time
                                        {getSortIcon("createdAt")}
                                    </Button>
                                </TableHead>
                                <TableHead>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSort("action")}
                                        className="h-auto p-0 font-semibold"
                                    >
                                        Action
                                        {getSortIcon("action")}
                                    </Button>
                                </TableHead>
                                <TableHead>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSort("targetType")}
                                        className="h-auto p-0 font-semibold"
                                    >
                                        Entity
                                        {getSortIcon("targetType")}
                                    </Button>
                                </TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length > 0 ? (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="text-sm">
                                                {new Date(
                                                    log.createdAt
                                                ).toLocaleString()}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">
                                                {formatAction(log.action)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {log.targetType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="text-sm">
                                                {log.actorEmail || (
                                                    <span className="text-muted-foreground italic">
                                                        System
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {hasDetails(log) ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        setSelectedLog(log)
                                                    }
                                                    className="h-auto p-2 text-xs text-muted-foreground hover:text-foreground"
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    <span className="truncate max-w-[200px]">
                                                        {getDetailsPreview(log)}
                                                    </span>
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    No details
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        No audit logs found matching your
                                        filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {logs.length >= 500 && (
                <div className="text-center text-sm text-muted-foreground">
                    Showing first 500 results. Use filters to narrow down your
                    search.
                </div>
            )}

            {/* Details Modal */}
            <Dialog
                open={selectedLog !== null}
                onOpenChange={(open) => !open && setSelectedLog(null)}
            >
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Audit Log Details</DialogTitle>
                    </DialogHeader>
                    {selectedLog && (
                        <div className="space-y-6 mt-4">
                            {/* Basic Information */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-sm">
                                    Basic Information
                                </h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">
                                            ID:
                                        </span>{" "}
                                        <span className="font-mono">
                                            {selectedLog.id}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Created At:
                                        </span>{" "}
                                        <span>
                                            {new Date(
                                                selectedLog.createdAt
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Action:
                                        </span>{" "}
                                        <span className="font-medium">
                                            {selectedLog.action}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Entity:
                                        </span>{" "}
                                        <Badge variant="outline">
                                            {selectedLog.targetType}
                                        </Badge>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Actor:
                                        </span>{" "}
                                        <span>
                                            {selectedLog.actorEmail || (
                                                <span className="text-muted-foreground italic">
                                                    System
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    {selectedLog.actorUserId && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Actor User ID:
                                            </span>{" "}
                                            <span className="font-mono">
                                                {selectedLog.actorUserId}
                                            </span>
                                        </div>
                                    )}
                                    {selectedLog.targetId && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Target ID:
                                            </span>{" "}
                                            <span className="font-mono">
                                                {selectedLog.targetId}
                                            </span>
                                        </div>
                                    )}
                                    {selectedLog.metadata &&
                                        typeof selectedLog.metadata ===
                                            "object" &&
                                        "requestId" in selectedLog.metadata &&
                                        selectedLog.metadata.requestId &&
                                        typeof selectedLog.metadata.requestId ===
                                            "string" &&
                                        selectedLog.metadata.requestId !==
                                            "unknown" && (
                                            <div className="col-span-2">
                                                <span className="text-muted-foreground">
                                                    Request ID:
                                                </span>{" "}
                                                <span className="font-mono">
                                                    {
                                                        selectedLog.metadata
                                                            .requestId
                                                    }
                                                </span>
                                            </div>
                                        )}
                                </div>
                            </div>

                            {/* Changes */}
                            {selectedLog.changes &&
                                Object.keys(selectedLog.changes).length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="font-semibold text-sm">
                                            Changes
                                        </h4>
                                        <div className="bg-muted/50 rounded-lg p-4">
                                            <pre className="text-xs font-mono overflow-x-auto">
                                                {formatJSON(selectedLog.changes)}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                            {/* Metadata */}
                            {selectedLog.metadata &&
                                Object.keys(selectedLog.metadata).length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="font-semibold text-sm">
                                            Metadata
                                        </h4>
                                        <div className="bg-muted/50 rounded-lg p-4">
                                            <pre className="text-xs font-mono overflow-x-auto">
                                                {formatJSON(selectedLog.metadata)}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                            {/* Request Information */}
                            {(selectedLog.ipAddress ||
                                selectedLog.userAgent) && (
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-sm">
                                        Request Information
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                        {selectedLog.ipAddress && (
                                            <div>
                                                <span className="text-muted-foreground">
                                                    IP Address:
                                                </span>{" "}
                                                <span className="font-mono">
                                                    {selectedLog.ipAddress}
                                                </span>
                                            </div>
                                        )}
                                        {selectedLog.userAgent && (
                                            <div>
                                                <span className="text-muted-foreground">
                                                    User Agent:
                                                </span>{" "}
                                                <span className="break-all">
                                                    {selectedLog.userAgent}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
