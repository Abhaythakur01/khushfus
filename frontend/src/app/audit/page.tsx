"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  Download,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { AuditAction } from "@/lib/auditLog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_email: string;
  user_name: string;
  action: AuditAction;
  resource_type: string;
  resource_id: string;
  details: string;
  ip_address: string;
}

// ---------------------------------------------------------------------------
// Action category mapping for badge colors
// ---------------------------------------------------------------------------

type ActionCategory = "auth" | "project" | "report" | "alert" | "apikey" | "member" | "settings" | "export" | "post";

function getActionCategory(action: string): ActionCategory {
  const prefix = action.split(".")[0];
  const map: Record<string, ActionCategory> = {
    auth: "auth",
    project: "project",
    report: "report",
    alert: "alert",
    apikey: "apikey",
    member: "member",
    settings: "settings",
    export: "export",
    post: "post",
  };
  return map[prefix] || "settings";
}

const categoryBadgeStyles: Record<ActionCategory, string> = {
  auth: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  project: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  report: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  alert: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  apikey: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  member: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  settings: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  export: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  post: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ---------------------------------------------------------------------------
// All known action types (from auditLog.ts AuditAction)
// ---------------------------------------------------------------------------

const ALL_ACTIONS: AuditAction[] = [
  "auth.login",
  "auth.logout",
  "auth.register",
  "auth.password_reset_request",
  "auth.password_reset_complete",
  "project.create",
  "project.update",
  "project.delete",
  "project.archive",
  "report.generate",
  "report.download",
  "alert.create",
  "alert.delete",
  "apikey.create",
  "apikey.revoke",
  "member.invite",
  "member.remove",
  "settings.update",
  "export.request",
  "post.create",
  "post.delete",
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Audit Page
// ---------------------------------------------------------------------------

export default function AuditPage() {
  // Filter state
  const [actionFilter, setActionFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Applied filters (only update on "Apply Filters" click)
  const [appliedFilters, setAppliedFilters] = useState({
    action: "",
    user: "",
    dateFrom: "",
    dateTo: "",
  });

  // Pagination
  const [page, setPage] = useState(1);

  // API data state
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sort direction (newest first by default)
  const [sortAsc, setSortAsc] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch from real API
  // ---------------------------------------------------------------------------

  const fetchLogs = useCallback(async (
    filters: typeof appliedFilters,
    currentPage: number,
    abortSignal?: AbortSignal,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: PAGE_SIZE,
      };
      if (filters.action) params.action = filters.action;
      if (filters.user) params.user_id = filters.user;
      if (filters.dateFrom) params.start_date = filters.dateFrom;
      if (filters.dateTo) params.end_date = filters.dateTo + "T23:59:59Z";

      const data = await api.getAuditLogs(params, abortSignal);
      setEntries((data.items as unknown as AuditLogEntry[]) ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load audit logs. Please try again.");
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever applied filters or page change
  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(appliedFilters, page, controller.signal);
    return () => controller.abort();
  }, [appliedFilters, page, fetchLogs]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const sortedEntries = [...entries].sort((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortAsc ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleApplyFilters = useCallback(() => {
    setPage(1);
    setAppliedFilters({
      action: actionFilter,
      user: userSearch,
      dateFrom: dateFrom,
      dateTo: dateTo,
    });
  }, [actionFilter, userSearch, dateFrom, dateTo]);

  const handleExportCsv = useCallback(() => {
    const headers = ["Timestamp", "User", "Email", "Action", "Resource Type", "Resource ID", "Details", "IP Address"];
    const rows = sortedEntries.map((e) => [
      e.timestamp,
      e.user_name,
      e.user_email,
      e.action,
      e.resource_type,
      e.resource_id,
      `"${e.details.replace(/"/g, '""')}"`,
      e.ip_address,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sortedEntries]);

  const toggleSort = useCallback(() => {
    setSortAsc((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Skeleton rows for loading state
  // ---------------------------------------------------------------------------

  const skeletonRows = Array.from({ length: PAGE_SIZE }, (_, i) => (
    <TableRow key={`skel-${i}`} className="border-white/[0.06]">
      <TableCell><div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-24 rounded bg-white/[0.06] animate-pulse" /></TableCell>
      <TableCell><div className="h-5 w-20 rounded-full bg-white/[0.06] animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-16 rounded bg-white/[0.06] animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-40 rounded bg-white/[0.06] animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-24 rounded bg-white/[0.06] animate-pulse" /></TableCell>
    </TableRow>
  ));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell title="Audit Log">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Filter className="h-5 w-5 text-slate-400" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              {/* Action type dropdown */}
              <div className="w-56">
                <label className="text-sm font-medium text-slate-300 mb-1 block">
                  Action Type
                </label>
                <Select
                  value={actionFilter}
                  onValueChange={(v) => setActionFilter(v)}
                  className="bg-white/[0.04] border-white/[0.06] text-slate-200"
                >
                  <option value="">All Actions</option>
                  {ALL_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </div>

              {/* User search */}
              <div className="w-56">
                <label className="text-sm font-medium text-slate-300 mb-1 block">
                  User
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email"
                    className="pl-9 bg-white/[0.04] border-white/[0.06] text-slate-200 placeholder:text-slate-500"
                  />
                </div>
              </div>

              {/* Date from */}
              <div className="w-44">
                <label className="text-sm font-medium text-slate-300 mb-1 block">
                  From
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.06] text-slate-200 [color-scheme:dark]"
                />
              </div>

              {/* Date to */}
              <div className="w-44">
                <label className="text-sm font-medium text-slate-300 mb-1 block">
                  To
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.06] text-slate-200 [color-scheme:dark]"
                />
              </div>

              {/* Apply button */}
              <Button
                onClick={handleApplyFilters}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card>
          <CardHeader className="border-white/[0.06] flex flex-row items-center justify-between">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-400" />
              Audit Trail
              <span className="text-sm font-normal text-slate-500 ml-2">
                {total} {total === 1 ? "entry" : "entries"}
              </span>
            </CardTitle>
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              disabled={entries.length === 0}
              className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04] hover:text-slate-100"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-red-400">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(appliedFilters, page)}
                  className="mt-4 border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"
                >
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                    <TableRow className="hover:bg-transparent border-white/[0.08]">
                      <TableHead className="text-slate-400">Timestamp</TableHead>
                      <TableHead className="text-slate-400">User</TableHead>
                      <TableHead className="text-slate-400">Action</TableHead>
                      <TableHead className="text-slate-400">Resource</TableHead>
                      <TableHead className="text-slate-400">Details</TableHead>
                      <TableHead className="text-slate-400">IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-white/[0.06]">{skeletonRows}</TableBody>
                </Table>
              </div>
            ) : sortedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No audit log entries found</p>
                <p className="text-xs text-slate-600 mt-1">
                  Try adjusting your filters or check back later.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                      <TableRow className="hover:bg-transparent border-white/[0.08]">
                        <TableHead
                          className="text-slate-400 cursor-pointer select-none hover:text-slate-200 transition-colors"
                          onClick={toggleSort}
                        >
                          <span className="inline-flex items-center gap-1">
                            Timestamp
                            <span className="text-[10px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>
                          </span>
                        </TableHead>
                        <TableHead className="text-slate-400">User</TableHead>
                        <TableHead className="text-slate-400">Action</TableHead>
                        <TableHead className="text-slate-400">Resource</TableHead>
                        <TableHead className="text-slate-400">Details</TableHead>
                        <TableHead className="text-slate-400">IP Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-white/[0.06]">
                      {sortedEntries.map((entry) => {
                        const category = getActionCategory(entry.action);
                        return (
                          <TableRow
                            key={entry.id}
                            className="border-white/[0.06] hover:bg-white/[0.04]"
                          >
                            <TableCell className="text-sm text-slate-300 whitespace-nowrap">
                              {formatDateTime(entry.timestamp)}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium text-slate-200">
                                  {entry.user_name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {entry.user_email}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  "border text-xs",
                                  categoryBadgeStyles[category],
                                )}
                              >
                                {entry.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-300">
                              <span className="text-slate-500">{entry.resource_type}</span>
                              {entry.resource_id && (
                                <span className="ml-1.5 text-slate-400">
                                  #{entry.resource_id}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-slate-400 max-w-[300px] truncate">
                              {entry.details}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-white/[0.04] text-slate-400 px-1.5 py-0.5 rounded">
                                {entry.ip_address}
                              </code>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] mt-4">
                    <p className="text-sm text-slate-500">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, total)} of{" "}
                      {total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </Button>
                      <span className="text-sm text-slate-400 px-2">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
