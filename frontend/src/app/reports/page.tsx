"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Download,
  Plus,
  Loader2,
  FolderOpen,
  Presentation,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface Report {
  id: number | string;
  title?: string;
  report_type?: string;
  type?: string;
  status?: string;
  format?: string;
  file_path?: string;
  created_at?: string;
  createdAt?: string;
}

const statusColor = (s: string) => {
  switch (s) {
    case "ready":
    case "completed":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "generating":
    case "pending":
    case "processing":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "failed":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
};

const formatBadgeColor = (fmt: string) => {
  switch (fmt) {
    case "pptx":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    default:
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
};

const REPORT_TYPES = [
  { value: "summary", label: "Summary" },
  { value: "sentiment", label: "Sentiment Analysis" },
  { value: "competitive", label: "Competitive Analysis" },
];

const SCHEDULE_FREQUENCIES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const FORMATS = [
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "pptx", label: "PPTX", icon: Presentation },
  { value: "csv", label: "CSV", icon: FileText },
  { value: "xlsx", label: "Excel", icon: FileText },
];

export default function ReportsPage() {
  const { projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("summary");
  const [reportFormat, setReportFormat] = useState("pdf");
  const [scheduleFrequency, setScheduleFrequency] = useState("daily");

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Load reports when project changes
  const fetchReports = useCallback(async (projectId: number) => {
    setLoading(true);
    try {
      const data = await api.getReports(projectId);
      setReports(data ?? []);
    } catch (err: any) {
      console.error("Failed to load reports:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchReports(selectedProjectId);
    }
  }, [selectedProjectId, fetchReports]);

  const handleGenerate = async () => {
    if (!selectedProjectId) return;
    setGenerating(true);
    try {
      await api.generateReport(selectedProjectId, reportType, reportFormat, scheduleFrequency);
      toast.success(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} ${reportFormat.toUpperCase()} report generation started`);
      setDialogOpen(false);
      // Refresh list
      await fetchReports(selectedProjectId);
    } catch (err: any) {
      console.error("Failed to generate report:", err);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const getDate = (r: Report) => r.created_at || r.createdAt || "";
  const getType = (r: Report) => r.report_type || r.type || "unknown";
  const getStatus = (r: Report) => r.status || "unknown";
  const getFormat = (r: Report) => r.format || "pdf";

  return (
    <AppShell title="Reports">
      <div className="space-y-6">
        {/* Top bar: project selector + generate button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-64">
            {projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
              </div>
            ) : projects.length > 0 ? (
              <Select
                value={String(selectedProjectId ?? "")}
                onValueChange={(v) => setSelectedProjectId(Number(v))}
                className="bg-[#111827]/70 border-white/[0.08] text-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-slate-500">No projects found</p>
            )}
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!selectedProjectId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
        </div>

        {/* Reports table */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <CardTitle className="text-slate-100">Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No reports generated yet</p>
                <p className="text-xs text-slate-600 mt-1">
                  Select a project and click &quot;Generate Report&quot; to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                    <TableRow className="hover:bg-transparent border-white/[0.08]">
                      <TableHead className="text-slate-400">Title</TableHead>
                      <TableHead className="text-slate-400">Type</TableHead>
                      <TableHead className="text-slate-400">Format</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Created</TableHead>
                      <TableHead className="text-slate-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-white/[0.06]">
                    {reports.map((report) => (
                      <TableRow key={report.id} className="border-white/[0.06] hover:bg-white/[0.04]">
                        <TableCell className="text-slate-200 font-medium">
                          <div className="flex items-center gap-2">
                            {getFormat(report) === "pptx" ? (
                              <Presentation className="h-4 w-4 text-orange-400" />
                            ) : (
                              <FileText className="h-4 w-4 text-blue-400" />
                            )}
                            {report.title || `${getType(report)} report`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-slate-300 capitalize">{getType(report)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("uppercase border text-xs", formatBadgeColor(getFormat(report)))}>
                            {getFormat(report)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("capitalize border", statusColor(getStatus(report)))}>
                            {getStatus(report)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm whitespace-nowrap">
                          {getDate(report) ? formatDate(getDate(report)) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={getStatus(report) !== "ready" && getStatus(report) !== "completed"}
                            title="Download"
                            className="text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                            onClick={() => {
                              if (report.file_path) {
                                window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${report.file_path}`, '_blank');
                              } else {
                                toast("Report file not yet available");
                              }
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generate Report Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="bg-[#111827]/70 border border-white/[0.08]">
        <DialogHeader onClose={() => setDialogOpen(false)} className="border-white/[0.08]">
          <span className="text-slate-100">Generate Report</span>
        </DialogHeader>
        <DialogContent className="space-y-5">
          {/* Report Type */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Report Type</label>
            <Select
              value={reportType}
              onValueChange={(v) => setReportType(v)}
              className="bg-white/[0.06] border-white/[0.08] text-slate-100"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Schedule Frequency */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Frequency</label>
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULE_FREQUENCIES.map((freq) => (
                <button
                  key={freq.value}
                  type="button"
                  onClick={() => setScheduleFrequency(freq.value)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-all border",
                    scheduleFrequency === freq.value
                      ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                      : "bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  )}
                >
                  {freq.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Format</label>
            <div className="flex gap-3">
              {FORMATS.map((fmt) => {
                const Icon = fmt.icon;
                return (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => setReportFormat(fmt.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all border",
                      reportFormat === fmt.value
                        ? fmt.value === "pptx"
                          ? "bg-orange-600/20 border-orange-500 text-orange-300"
                          : "bg-blue-600/20 border-blue-500 text-blue-300"
                        : "bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-slate-600 hover:text-slate-300"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {fmt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-[#111827]/70">
          <Button
            variant="outline"
            onClick={() => setDialogOpen(false)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}
