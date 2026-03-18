"use client";

import { useState, useMemo, useCallback } from "react";
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
// TODO: Replace mock data with real API call when backend endpoint is ready.
// Expected endpoint: GET /api/v1/audit/events?action=...&user=...&from=...&to=...&page=...&limit=...
// Response shape: { items: AuditLogEntry[], total: number }
// ---------------------------------------------------------------------------

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
// Mock data — realistic audit trail entries
// ---------------------------------------------------------------------------

function generateMockData(): AuditLogEntry[] {
  const users = [
    { email: "admin@acme.com", name: "Alice Chen" },
    { email: "bob@acme.com", name: "Bob Patel" },
    { email: "carol@acme.com", name: "Carol Singh" },
    { email: "dev@acme.com", name: "Dev Sharma" },
    { email: "eva@acme.com", name: "Eva Martinez" },
  ];

  const entries: AuditLogEntry[] = [
    { id: "aud_001", timestamp: "2026-03-17T09:12:33Z", user_email: users[0].email, user_name: users[0].name, action: "auth.login", resource_type: "session", resource_id: "sess_abc123", details: "Login via email/password", ip_address: "192.168.1.10" },
    { id: "aud_002", timestamp: "2026-03-17T09:15:01Z", user_email: users[0].email, user_name: users[0].name, action: "project.create", resource_type: "project", resource_id: "42", details: "Created project 'Brand Monitor Q1'", ip_address: "192.168.1.10" },
    { id: "aud_003", timestamp: "2026-03-17T09:22:47Z", user_email: users[1].email, user_name: users[1].name, action: "auth.login", resource_type: "session", resource_id: "sess_def456", details: "Login via SSO (SAML)", ip_address: "10.0.0.55" },
    { id: "aud_004", timestamp: "2026-03-17T09:30:12Z", user_email: users[0].email, user_name: users[0].name, action: "member.invite", resource_type: "member", resource_id: "carol@acme.com", details: "Invited carol@acme.com as analyst", ip_address: "192.168.1.10" },
    { id: "aud_005", timestamp: "2026-03-17T09:45:00Z", user_email: users[1].email, user_name: users[1].name, action: "report.generate", resource_type: "report", resource_id: "rpt_789", details: "Generated PDF report for project 42", ip_address: "10.0.0.55" },
    { id: "aud_006", timestamp: "2026-03-17T10:00:33Z", user_email: users[2].email, user_name: users[2].name, action: "auth.login", resource_type: "session", resource_id: "sess_ghi789", details: "Login via email/password", ip_address: "172.16.0.22" },
    { id: "aud_007", timestamp: "2026-03-17T10:05:19Z", user_email: users[2].email, user_name: users[2].name, action: "alert.create", resource_type: "alert_rule", resource_id: "rule_101", details: "Created volume spike alert for project 42", ip_address: "172.16.0.22" },
    { id: "aud_008", timestamp: "2026-03-17T10:12:45Z", user_email: users[0].email, user_name: users[0].name, action: "apikey.create", resource_type: "api_key", resource_id: "key_202", details: "Created API key 'Production Bot'", ip_address: "192.168.1.10" },
    { id: "aud_009", timestamp: "2026-03-17T10:30:00Z", user_email: users[3].email, user_name: users[3].name, action: "auth.login", resource_type: "session", resource_id: "sess_jkl012", details: "Login via email/password", ip_address: "10.0.1.100" },
    { id: "aud_010", timestamp: "2026-03-17T10:35:22Z", user_email: users[3].email, user_name: users[3].name, action: "export.request", resource_type: "export", resource_id: "exp_303", details: "Requested CSV export of 1,247 mentions", ip_address: "10.0.1.100" },
    { id: "aud_011", timestamp: "2026-03-17T10:45:11Z", user_email: users[0].email, user_name: users[0].name, action: "project.update", resource_type: "project", resource_id: "42", details: "Updated keywords for 'Brand Monitor Q1'", ip_address: "192.168.1.10" },
    { id: "aud_012", timestamp: "2026-03-17T11:00:05Z", user_email: users[1].email, user_name: users[1].name, action: "report.download", resource_type: "report", resource_id: "rpt_789", details: "Downloaded PDF report rpt_789", ip_address: "10.0.0.55" },
    { id: "aud_013", timestamp: "2026-03-17T11:15:38Z", user_email: users[4].email, user_name: users[4].name, action: "auth.login", resource_type: "session", resource_id: "sess_mno345", details: "Login via email/password", ip_address: "203.0.113.42" },
    { id: "aud_014", timestamp: "2026-03-17T11:20:00Z", user_email: users[4].email, user_name: users[4].name, action: "post.create", resource_type: "scheduled_post", resource_id: "post_404", details: "Scheduled post on Twitter for 2026-03-18", ip_address: "203.0.113.42" },
    { id: "aud_015", timestamp: "2026-03-17T11:30:29Z", user_email: users[0].email, user_name: users[0].name, action: "settings.update", resource_type: "organization", resource_id: "org_1", details: "Updated organization name to 'Acme Corp'", ip_address: "192.168.1.10" },
    { id: "aud_016", timestamp: "2026-03-17T11:45:10Z", user_email: users[2].email, user_name: users[2].name, action: "alert.delete", resource_type: "alert_rule", resource_id: "rule_99", details: "Deleted inactive alert rule 'Old Volume Alert'", ip_address: "172.16.0.22" },
    { id: "aud_017", timestamp: "2026-03-17T12:00:00Z", user_email: users[0].email, user_name: users[0].name, action: "apikey.revoke", resource_type: "api_key", resource_id: "key_101", details: "Revoked API key 'Staging Bot'", ip_address: "192.168.1.10" },
    { id: "aud_018", timestamp: "2026-03-17T12:10:33Z", user_email: users[1].email, user_name: users[1].name, action: "auth.logout", resource_type: "session", resource_id: "sess_def456", details: "User logged out", ip_address: "10.0.0.55" },
    { id: "aud_019", timestamp: "2026-03-17T12:15:45Z", user_email: users[3].email, user_name: users[3].name, action: "project.archive", resource_type: "project", resource_id: "38", details: "Archived project 'Legacy Campaign'", ip_address: "10.0.1.100" },
    { id: "aud_020", timestamp: "2026-03-17T12:25:00Z", user_email: users[0].email, user_name: users[0].name, action: "member.remove", resource_type: "member", resource_id: "user_55", details: "Removed user dev-intern@acme.com from org", ip_address: "192.168.1.10" },
    { id: "aud_021", timestamp: "2026-03-17T12:30:18Z", user_email: users[4].email, user_name: users[4].name, action: "post.delete", resource_type: "scheduled_post", resource_id: "post_390", details: "Deleted scheduled post for Facebook", ip_address: "203.0.113.42" },
    { id: "aud_022", timestamp: "2026-03-17T12:45:55Z", user_email: users[2].email, user_name: users[2].name, action: "auth.password_reset_request", resource_type: "user", resource_id: "carol@acme.com", details: "Requested password reset", ip_address: "172.16.0.22" },
    { id: "aud_023", timestamp: "2026-03-17T13:00:02Z", user_email: users[2].email, user_name: users[2].name, action: "auth.password_reset_complete", resource_type: "user", resource_id: "carol@acme.com", details: "Password reset completed", ip_address: "172.16.0.22" },
    { id: "aud_024", timestamp: "2026-03-17T13:05:30Z", user_email: users[0].email, user_name: users[0].name, action: "project.delete", resource_type: "project", resource_id: "35", details: "Deleted project 'Test Campaign'", ip_address: "192.168.1.10" },
    { id: "aud_025", timestamp: "2026-03-17T13:15:44Z", user_email: users[3].email, user_name: users[3].name, action: "auth.register", resource_type: "user", resource_id: "newuser@acme.com", details: "New user registration", ip_address: "10.0.1.100" },
  ];

  return entries;
}

const MOCK_ENTRIES = generateMockData();

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

  // Simulated loading state
  const [loading, setLoading] = useState(false);

  // Sort direction (newest first by default)
  const [sortAsc, setSortAsc] = useState(false);

  // ---------------------------------------------------------------------------
  // Filtering + sorting + pagination
  // ---------------------------------------------------------------------------

  const filteredEntries = useMemo(() => {
    let results = [...MOCK_ENTRIES];

    // Filter by action
    if (appliedFilters.action) {
      results = results.filter((e) => e.action === appliedFilters.action);
    }

    // Filter by user search (name or email)
    if (appliedFilters.user) {
      const q = appliedFilters.user.toLowerCase();
      results = results.filter(
        (e) =>
          e.user_name.toLowerCase().includes(q) ||
          e.user_email.toLowerCase().includes(q),
      );
    }

    // Filter by date range
    if (appliedFilters.dateFrom) {
      const from = new Date(appliedFilters.dateFrom);
      results = results.filter((e) => new Date(e.timestamp) >= from);
    }
    if (appliedFilters.dateTo) {
      const to = new Date(appliedFilters.dateTo + "T23:59:59Z");
      results = results.filter((e) => new Date(e.timestamp) <= to);
    }

    // Sort by timestamp
    results.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortAsc ? diff : -diff;
    });

    return results;
  }, [appliedFilters, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const paginatedEntries = filteredEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleApplyFilters = useCallback(() => {
    setLoading(true);
    setPage(1);
    // Simulate network delay for realism
    setTimeout(() => {
      setAppliedFilters({
        action: actionFilter,
        user: userSearch,
        dateFrom: dateFrom,
        dateTo: dateTo,
      });
      setLoading(false);
    }, 300);
  }, [actionFilter, userSearch, dateFrom, dateTo]);

  const handleExportCsv = useCallback(() => {
    const headers = ["Timestamp", "User", "Email", "Action", "Resource Type", "Resource ID", "Details", "IP Address"];
    const rows = filteredEntries.map((e) => [
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
  }, [filteredEntries]);

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
                {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
              </span>
            </CardTitle>
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              disabled={filteredEntries.length === 0}
              className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04] hover:text-slate-100"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
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
            ) : paginatedEntries.length === 0 ? (
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
                      {paginatedEntries.map((entry) => {
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
                      {Math.min(page * PAGE_SIZE, filteredEntries.length)} of{" "}
                      {filteredEntries.length}
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
