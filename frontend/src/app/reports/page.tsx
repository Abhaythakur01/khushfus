"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Eye,
  Trash2,
  Plus,
  FileBarChart,
  Brain,
  Target,
  Loader2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
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
import {
  Dialog,
} from "@/components/ui/dialog";

type ReportStatus = "ready" | "generating" | "failed";
type ReportFormat = "PDF" | "HTML";
type ReportType = "Daily Summary" | "Weekly Analysis" | "Monthly Comprehensive" | "Custom";

interface Report {
  id: string;
  title: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  status: ReportStatus;
  format: ReportFormat;
  createdAt: string;
}

const mockReports: Report[] = [
  {
    id: "1",
    title: "Weekly Sentiment Analysis - W9 2026",
    type: "Weekly Analysis",
    periodStart: "2026-02-23",
    periodEnd: "2026-03-01",
    status: "ready",
    format: "PDF",
    createdAt: "2026-03-02T09:00:00Z",
  },
  {
    id: "2",
    title: "February 2026 Comprehensive Report",
    type: "Monthly Comprehensive",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    status: "ready",
    format: "PDF",
    createdAt: "2026-03-01T08:30:00Z",
  },
  {
    id: "3",
    title: "Daily Summary - Mar 6, 2026",
    type: "Daily Summary",
    periodStart: "2026-03-06",
    periodEnd: "2026-03-06",
    status: "generating",
    format: "HTML",
    createdAt: "2026-03-06T23:00:00Z",
  },
  {
    id: "4",
    title: "Custom: Product Launch Analysis",
    type: "Custom",
    periodStart: "2026-01-15",
    periodEnd: "2026-02-15",
    status: "ready",
    format: "PDF",
    createdAt: "2026-02-16T10:00:00Z",
  },
  {
    id: "5",
    title: "Weekly Sentiment Analysis - W8 2026",
    type: "Weekly Analysis",
    periodStart: "2026-02-16",
    periodEnd: "2026-02-22",
    status: "ready",
    format: "HTML",
    createdAt: "2026-02-23T09:00:00Z",
  },
  {
    id: "6",
    title: "January 2026 Comprehensive Report",
    type: "Monthly Comprehensive",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    status: "ready",
    format: "PDF",
    createdAt: "2026-02-01T08:30:00Z",
  },
  {
    id: "7",
    title: "Custom: Competitor Benchmark Q1",
    type: "Custom",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-05",
    status: "failed",
    format: "PDF",
    createdAt: "2026-03-05T14:00:00Z",
  },
  {
    id: "8",
    title: "Daily Summary - Mar 5, 2026",
    type: "Daily Summary",
    periodStart: "2026-03-05",
    periodEnd: "2026-03-05",
    status: "ready",
    format: "HTML",
    createdAt: "2026-03-05T23:00:00Z",
  },
];

const statusStyles: Record<ReportStatus, string> = {
  ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  generating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const templates = [
  {
    title: "Executive Summary",
    description:
      "High-level overview of brand sentiment, key metrics, and trending topics for leadership stakeholders.",
    icon: FileBarChart,
  },
  {
    title: "Sentiment Deep-Dive",
    description:
      "Detailed sentiment breakdown by source, topic, and time period with anomaly detection insights.",
    icon: Brain,
  },
  {
    title: "Competitive Analysis",
    description:
      "Side-by-side comparison of brand mentions, sentiment, and share of voice against competitors.",
    icon: Target,
  },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>(
    [...mockReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formType, setFormType] = useState<ReportType>("Daily Summary");
  const [formFormat, setFormFormat] = useState<ReportFormat>("PDF");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate generation delay
    await new Promise((r) => setTimeout(r, 1500));
    const newReport: Report = {
      id: String(Date.now()),
      title: `${formType} - ${formStart}`,
      type: formType,
      periodStart: formStart,
      periodEnd: formEnd,
      status: "generating",
      format: formFormat,
      createdAt: new Date().toISOString(),
    };
    setReports((prev) => [newReport, ...prev]);
    setGenerating(false);
    setDialogOpen(false);
    setFormStart("");
    setFormEnd("");
  };

  const handleDelete = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Generate, view, and download analytical reports.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
      </div>

      {/* Generate Report Dialog */}
      {dialogOpen && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">Generate Report</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Report Type
                  </label>
                  <Select
                    value={formType}
                    onValueChange={(v: string) => setFormType(v as ReportType)}
                  >
                    <option value="Daily Summary">Daily Summary</option>
                    <option value="Weekly Analysis">Weekly Analysis</option>
                    <option value="Monthly Comprehensive">Monthly Comprehensive</option>
                    <option value="Custom">Custom</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      End Date
                    </label>
                    <Input
                      type="date"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Format
                  </label>
                  <div className="flex gap-4">
                    {(["PDF", "HTML"] as ReportFormat[]).map((fmt) => (
                      <label
                        key={fmt}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="format"
                          checked={formFormat === fmt}
                          onChange={() => setFormFormat(fmt)}
                          className="accent-primary"
                        />
                        <span className="text-sm">{fmt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !formStart || !formEnd}
                >
                  {generating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Generate
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium max-w-[250px] truncate">
                      {report.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {report.periodStart} &mdash; {report.periodEnd}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize", statusStyles[report.status])}>
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(report.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={report.status !== "ready"}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={report.status !== "ready"}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(report.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Report Templates */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Report Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <Card key={tpl.title}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <tpl.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{tpl.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tpl.description}
                    </p>
                    <Button variant="outline" size="sm" className="mt-3">
                      Use Template
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
