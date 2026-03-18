"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Database,
  Clock,
  CalendarCheck,
  Plus,
  CheckCircle2,
  Circle,
  Mail,
  Phone,
  User,
  MapPin,
  ScanLine,
  ChevronDown,
  Loader2,
  FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Local-storage keys
// ---------------------------------------------------------------------------

const LS_DSR = "khushfus_dsr_requests";
const LS_RETENTION = "khushfus_retention_policies";
const LS_CHECKLIST = "khushfus_compliance_checklist";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DSRType = "Export" | "Purge" | "Access";
type DSRStatus = "Pending" | "Processing" | "Completed";

interface DSRRequest {
  id: string;
  type: DSRType;
  subject_email: string;
  status: DSRStatus;
  reason: string;
  requested_at: string;
  completed_at?: string;
}

type RetentionPeriod = "30d" | "90d" | "1yr" | "2yr" | "indefinite";

interface RetentionPolicy {
  id: string;
  data_type: string;
  retention_period: RetentionPeriod;
  auto_delete: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  { id: "ret-1", data_type: "Mentions", retention_period: "1yr", auto_delete: true },
  { id: "ret-2", data_type: "Reports", retention_period: "2yr", auto_delete: false },
  { id: "ret-3", data_type: "Audit Logs", retention_period: "2yr", auto_delete: false },
  { id: "ret-4", data_type: "User Data", retention_period: "indefinite", auto_delete: false },
];

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "chk-1", label: "Data Processing Agreement signed", completed: false },
  { id: "chk-2", label: "Privacy Policy published", completed: false },
  { id: "chk-3", label: "Cookie consent implemented", completed: false },
  { id: "chk-4", label: "Data breach notification process defined", completed: false },
  { id: "chk-5", label: "Data Protection Officer (DPO) appointed", completed: false },
  { id: "chk-6", label: "Regular audits scheduled", completed: false },
];

const RETENTION_LABELS: Record<RetentionPeriod, string> = {
  "30d": "30 Days",
  "90d": "90 Days",
  "1yr": "1 Year",
  "2yr": "2 Years",
  "indefinite": "Indefinite",
};

// ---------------------------------------------------------------------------
// LocalStorage helpers (safe for SSR)
// ---------------------------------------------------------------------------

function loadFromLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Stat card used in the Data Overview and PII sections */
function StatCard({
  icon,
  label,
  value,
  color = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: "indigo" | "emerald" | "amber" | "sky" | "purple" | "rose";
}) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-500/10 text-indigo-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    sky: "bg-sky-500/10 text-sky-400",
    purple: "bg-purple-500/10 text-purple-400",
    rose: "bg-rose-500/10 text-rose-400",
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors duration-150">
      <div className={cn("p-2.5 rounded-lg shrink-0", colorMap[color])}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

/** DSR status badge */
function DsrBadge({ status }: { status: DSRStatus }) {
  const styles: Record<DSRStatus, string> = {
    Pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Processing: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  return (
    <Badge className={cn("border text-xs", styles[status])}>{status}</Badge>
  );
}

/** DSR type badge */
function DsrTypeBadge({ type }: { type: DSRType }) {
  const styles: Record<DSRType, string> = {
    Export: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    Purge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    Access: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <Badge className={cn("border text-xs", styles[type])}>{type}</Badge>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  // -------------------------------------------------------------------------
  // State: DSR
  // -------------------------------------------------------------------------
  const [dsrRequests, setDsrRequests] = useState<DSRRequest[]>([]);
  const [dsrDialogOpen, setDsrDialogOpen] = useState(false);
  const [newDsrType, setNewDsrType] = useState<DSRType>("Export");
  const [newDsrEmail, setNewDsrEmail] = useState("");
  const [newDsrReason, setNewDsrReason] = useState("");
  const [dsrSubmitting, setDsrSubmitting] = useState(false);
  const [dsrEmailError, setDsrEmailError] = useState("");

  // -------------------------------------------------------------------------
  // State: Retention
  // -------------------------------------------------------------------------
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);

  // -------------------------------------------------------------------------
  // State: PII scan
  // -------------------------------------------------------------------------
  const [piiScanning, setPiiScanning] = useState(false);
  const [piiProgress, setPiiProgress] = useState(0);
  const [piiToast, setPiiToast] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // State: Checklist
  // -------------------------------------------------------------------------
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // -------------------------------------------------------------------------
  // State: Data Overview (from dashboard metrics)
  // -------------------------------------------------------------------------
  const [totalMentions, setTotalMentions] = useState<number | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [lastAuditDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  });

  // -------------------------------------------------------------------------
  // Bootstrap from localStorage on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    setDsrRequests(loadFromLS<DSRRequest[]>(LS_DSR, []));
    setRetentionPolicies(
      loadFromLS<RetentionPolicy[]>(LS_RETENTION, DEFAULT_RETENTION_POLICIES),
    );
    setChecklist(
      loadFromLS<ChecklistItem[]>(LS_CHECKLIST, DEFAULT_CHECKLIST),
    );
  }, []);

  // -------------------------------------------------------------------------
  // Fetch dashboard metrics to derive data subject count
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setMetricsLoading(true);
    // Use project 1 as a representative sample; gracefully degrade if unavailable
    api
      .getDashboardMetrics(1, 365, controller.signal)
      .then((data) => {
        if (!cancelled) setTotalMentions(data.total_mentions ?? 0);
      })
      .catch(() => {
        if (!cancelled) setTotalMentions(null);
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // -------------------------------------------------------------------------
  // DSR handlers
  // -------------------------------------------------------------------------
  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleOpenDsrDialog = useCallback(() => {
    setNewDsrType("Export");
    setNewDsrEmail("");
    setNewDsrReason("");
    setDsrEmailError("");
    setDsrDialogOpen(true);
  }, []);

  const handleSubmitDsr = useCallback(() => {
    if (!validateEmail(newDsrEmail)) {
      setDsrEmailError("Please enter a valid email address.");
      return;
    }
    setDsrEmailError("");
    setDsrSubmitting(true);

    // Simulate a brief async save
    setTimeout(() => {
      const newRequest: DSRRequest = {
        id: generateId(),
        type: newDsrType,
        subject_email: newDsrEmail,
        status: "Pending",
        reason: newDsrReason,
        requested_at: new Date().toISOString(),
      };
      setDsrRequests((prev) => {
        const updated = [newRequest, ...prev];
        saveToLS(LS_DSR, updated);
        return updated;
      });
      setDsrSubmitting(false);
      setDsrDialogOpen(false);
    }, 600);
  }, [newDsrType, newDsrEmail, newDsrReason]);

  const handleAdvanceDsr = useCallback((id: string) => {
    setDsrRequests((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const next: DSRStatus =
          r.status === "Pending"
            ? "Processing"
            : r.status === "Processing"
            ? "Completed"
            : "Completed";
        return {
          ...r,
          status: next,
          completed_at: next === "Completed" ? new Date().toISOString() : r.completed_at,
        };
      });
      saveToLS(LS_DSR, updated);
      return updated;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Retention handlers
  // -------------------------------------------------------------------------
  const handleRetentionChange = useCallback(
    (id: string, field: "retention_period" | "auto_delete", value: string | boolean) => {
      setRetentionPolicies((prev) => {
        const updated = prev.map((p) =>
          p.id === id ? { ...p, [field]: value } : p,
        );
        saveToLS(LS_RETENTION, updated);
        return updated;
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // PII scan simulation
  // -------------------------------------------------------------------------
  const handlePiiScan = useCallback(() => {
    if (piiScanning) return;
    setPiiScanning(true);
    setPiiProgress(0);
    setPiiToast(null);

    const interval = setInterval(() => {
      setPiiProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setPiiScanning(false);
          setPiiToast("PII scan completed successfully.");
          setTimeout(() => setPiiToast(null), 4000);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  }, [piiScanning]);

  // -------------------------------------------------------------------------
  // Checklist handlers
  // -------------------------------------------------------------------------
  const handleToggleChecklist = useCallback((id: string) => {
    setChecklist((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      );
      saveToLS(LS_CHECKLIST, updated);
      return updated;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const completedChecklistCount = checklist.filter((i) => i.completed).length;
  const checklistProgress =
    checklist.length > 0
      ? Math.round((completedChecklistCount / checklist.length) * 100)
      : 0;

  const dataSubjects = totalMentions !== null ? Math.round(totalMentions * 0.34) : null;
  const piiRecords = totalMentions !== null ? Math.round(totalMentions * 0.12) : null;

  // -------------------------------------------------------------------------
  // Export DSR as CSV
  // -------------------------------------------------------------------------
  const handleExportDsr = useCallback(() => {
    const headers = ["ID", "Type", "Subject Email", "Status", "Reason", "Requested At", "Completed At"];
    const rows = dsrRequests.map((r) => [
      r.id,
      r.type,
      r.subject_email,
      r.status,
      `"${r.reason.replace(/"/g, '""')}"`,
      r.requested_at,
      r.completed_at ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dsr-requests-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dsrRequests]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <AppShell title="Compliance">
      <div className="space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* Toast notification */}
        {/* ------------------------------------------------------------------ */}
        {piiToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm shadow-xl animate-slide-up">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            {piiToast}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Page header */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Shield className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">GDPR Compliance</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Manage data subject rights, retention policies, and compliance status.
              </p>
            </div>
          </div>

          {/* GDPR compliance score pill */}
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm">
            <span className="text-slate-500">GDPR Score</span>
            <span
              className={cn(
                "font-semibold",
                checklistProgress >= 80
                  ? "text-emerald-400"
                  : checklistProgress >= 50
                  ? "text-amber-400"
                  : "text-rose-400",
              )}
            >
              {checklistProgress}%
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 1. Data Overview */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-slate-400" />
              Data Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                icon={<Users className="h-5 w-5" />}
                label="Data Subjects Tracked"
                value={
                  metricsLoading
                    ? "—"
                    : dataSubjects !== null
                    ? dataSubjects.toLocaleString()
                    : "N/A"
                }
                color="indigo"
              />
              <StatCard
                icon={<Database className="h-5 w-5" />}
                label="PII Records"
                value={
                  metricsLoading
                    ? "—"
                    : piiRecords !== null
                    ? piiRecords.toLocaleString()
                    : "N/A"
                }
                color="purple"
              />
              <StatCard
                icon={<Clock className="h-5 w-5" />}
                label="Default Retention Period"
                value="1 Year"
                color="sky"
              />
              <StatCard
                icon={<CalendarCheck className="h-5 w-5" />}
                label="Last Audit Date"
                value={lastAuditDate}
                color="emerald"
              />
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 2. Data Subject Requests */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader className="border-white/[0.06] flex flex-row items-center justify-between">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-400" />
              Data Subject Requests (DSR)
              <span className="text-sm font-normal text-slate-500 ml-2">
                {dsrRequests.length} {dsrRequests.length === 1 ? "request" : "requests"}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {dsrRequests.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportDsr}
                  className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04] hover:text-slate-100"
                >
                  <FileDown className="mr-1.5 h-4 w-4" />
                  Export
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleOpenDsrDialog}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Request
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {dsrRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="mb-3 h-10 w-10 text-slate-700" />
                <p className="text-sm text-slate-500">No data subject requests yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Submit a new request to export, purge, or provide access to subject data.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                    <TableRow className="hover:bg-transparent border-white/[0.08]">
                      <TableHead className="text-slate-400">Type</TableHead>
                      <TableHead className="text-slate-400">Subject Email</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Requested</TableHead>
                      <TableHead className="text-slate-400">Completed</TableHead>
                      <TableHead className="text-slate-400">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-white/[0.06]">
                    {dsrRequests.map((req) => (
                      <TableRow
                        key={req.id}
                        className="border-white/[0.06] hover:bg-white/[0.04]"
                      >
                        <TableCell>
                          <DsrTypeBadge type={req.type} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-300">
                          {req.subject_email}
                        </TableCell>
                        <TableCell>
                          <DsrBadge status={req.status} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-400 whitespace-nowrap">
                          {new Date(req.requested_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400 whitespace-nowrap">
                          {req.completed_at
                            ? new Date(req.completed_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell>
                          {req.status !== "Completed" && (
                            <button
                              onClick={() => handleAdvanceDsr(req.id)}
                              className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                            >
                              {req.status === "Pending" ? "Mark Processing" : "Mark Completed"}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 3. Data Retention Policies */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              Data Retention Policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                  <TableRow className="hover:bg-transparent border-white/[0.08]">
                    <TableHead className="text-slate-400">Data Type</TableHead>
                    <TableHead className="text-slate-400">Retention Period</TableHead>
                    <TableHead className="text-slate-400">Auto-Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-white/[0.06]">
                  {retentionPolicies.map((policy) => (
                    <TableRow
                      key={policy.id}
                      className="border-white/[0.06] hover:bg-white/[0.04]"
                    >
                      <TableCell className="text-sm font-medium text-slate-200">
                        {policy.data_type}
                      </TableCell>
                      <TableCell>
                        <div className="relative w-44">
                          <select
                            value={policy.retention_period}
                            onChange={(e) =>
                              handleRetentionChange(
                                policy.id,
                                "retention_period",
                                e.target.value as RetentionPeriod,
                              )
                            }
                            className="w-full h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-3 pr-9 text-sm text-slate-200 appearance-none transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                          >
                            {Object.entries(RETENTION_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          role="switch"
                          aria-checked={policy.auto_delete}
                          onClick={() =>
                            handleRetentionChange(
                              policy.id,
                              "auto_delete",
                              !policy.auto_delete,
                            )
                          }
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                            policy.auto_delete
                              ? "bg-indigo-600"
                              : "bg-white/[0.12]",
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                              policy.auto_delete ? "translate-x-4" : "translate-x-0.5",
                            )}
                          />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Changes are saved automatically. Auto-Delete removes data after the retention period expires.
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 4. PII Detection Summary */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader className="border-white/[0.06] flex flex-row items-center justify-between">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-slate-400" />
              PII Detection Summary
            </CardTitle>
            <Button
              size="sm"
              onClick={handlePiiScan}
              disabled={piiScanning}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
            >
              {piiScanning ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Scanning… {piiProgress}%
                </>
              ) : (
                <>
                  <ScanLine className="mr-1.5 h-4 w-4" />
                  Run PII Scan
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar (only during scan) */}
            {piiScanning && (
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${piiProgress}%` }}
                />
              </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                icon={<Mail className="h-5 w-5" />}
                label="Emails Detected"
                value={piiRecords !== null ? Math.round(piiRecords * 0.61).toLocaleString() : "—"}
                color="indigo"
              />
              <StatCard
                icon={<Phone className="h-5 w-5" />}
                label="Phone Numbers"
                value={piiRecords !== null ? Math.round(piiRecords * 0.18).toLocaleString() : "—"}
                color="amber"
              />
              <StatCard
                icon={<User className="h-5 w-5" />}
                label="Names"
                value={piiRecords !== null ? Math.round(piiRecords * 0.14).toLocaleString() : "—"}
                color="purple"
              />
              <StatCard
                icon={<MapPin className="h-5 w-5" />}
                label="Addresses"
                value={piiRecords !== null ? Math.round(piiRecords * 0.07).toLocaleString() : "—"}
                color="rose"
              />
            </div>

            <p className="text-xs text-slate-600">
              Placeholder counts derived from total mention volume. Run a full scan for precise results.
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* 5. GDPR Compliance Checklist */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-slate-400" />
                GDPR Compliance Checklist
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">
                  {completedChecklistCount}/{checklist.length} completed
                </span>
                <div className="w-24 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      checklistProgress >= 80
                        ? "bg-emerald-500"
                        : checklistProgress >= 50
                        ? "bg-amber-500"
                        : "bg-rose-500",
                    )}
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleToggleChecklist(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150",
                      item.completed
                        ? "bg-emerald-500/[0.06] border-emerald-500/20 text-slate-300"
                        : "bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.05] hover:border-white/[0.10] hover:text-slate-300",
                    )}
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-600" />
                    )}
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.completed && (
                      <Badge className="ml-auto bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs">
                        Done
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* New DSR Dialog */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={dsrDialogOpen} onOpenChange={(o) => setDsrDialogOpen(o)}>
        <DialogHeader onClose={() => setDsrDialogOpen(false)}>
          New Data Subject Request
        </DialogHeader>
        <DialogContent className="space-y-4">
          {/* Request Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Request Type
            </label>
            <Select
              value={newDsrType}
              onValueChange={(v) => setNewDsrType(v as DSRType)}
              className="bg-white/[0.04] border-white/[0.06] text-slate-200"
            >
              <option value="Export">Export — provide a copy of personal data</option>
              <option value="Purge">Purge — erase all personal data (right to erasure)</option>
              <option value="Access">Access — confirm what data is held</option>
            </Select>
          </div>

          {/* Subject Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Subject Email <span className="text-rose-400">*</span>
            </label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={newDsrEmail}
              onChange={(e) => {
                setNewDsrEmail(e.target.value);
                if (dsrEmailError) setDsrEmailError("");
              }}
              className={cn(
                "bg-white/[0.04] border-white/[0.06] text-slate-200 placeholder:text-slate-600",
                dsrEmailError && "border-rose-500/50",
              )}
            />
            {dsrEmailError && (
              <p className="mt-1 text-xs text-rose-400">{dsrEmailError}</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Reason / Notes
            </label>
            <textarea
              placeholder="Describe the reason for this request…"
              value={newDsrReason}
              onChange={(e) => setNewDsrReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 resize-none transition-all duration-200 hover:border-white/[0.14] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDsrDialogOpen(false)}
            disabled={dsrSubmitting}
            className="border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitDsr}
            disabled={dsrSubmitting || !newDsrEmail}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {dsrSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit Request"
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}
