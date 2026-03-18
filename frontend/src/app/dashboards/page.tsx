"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  Save,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  LayoutDashboard,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart2,
  MessageSquare,
  Type,
  Activity,
  ChevronLeft,
  AlertCircle,
  Lock,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Dynamic Recharts import (deferred)
// ---------------------------------------------------------------------------

const WidgetCharts = dynamic(() => import("./WidgetCharts"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WidgetType =
  | "kpi_card"
  | "line_chart"
  | "pie_chart"
  | "bar_chart"
  | "recent_mentions"
  | "word_cloud";

export type KpiMetric =
  | "total_mentions"
  | "avg_sentiment"
  | "total_reach"
  | "engagement";

export type ChartVariant =
  | "sentiment_breakdown"
  | "platform_breakdown"
  | "mention_trend";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  metric?: KpiMetric;
  chartVariant?: ChartVariant;
  timeRange?: "7d" | "14d" | "30d" | "90d";
  projectId?: number | null;
}

export interface CustomDashboard {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const LS_KEY = "khushfus_custom_dashboards";

function loadDashboards(): CustomDashboard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomDashboard[];
  } catch {
    return [];
  }
}

function saveDashboards(dashboards: CustomDashboard[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(dashboards));
  } catch {
    // storage full or unavailable — fail silently
  }
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Widget catalog
// ---------------------------------------------------------------------------

const WIDGET_CATALOG: Array<{
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    type: "kpi_card",
    label: "KPI Card",
    description: "Single metric: total mentions, avg sentiment, reach or engagement",
    icon: <Activity className="h-5 w-5" />,
  },
  {
    type: "line_chart",
    label: "Line Chart",
    description: "Mention trend over time",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    type: "pie_chart",
    label: "Pie Chart",
    description: "Sentiment or platform breakdown",
    icon: <PieChartIcon className="h-5 w-5" />,
  },
  {
    type: "bar_chart",
    label: "Bar Chart",
    description: "Platform comparison or top keywords",
    icon: <BarChart2 className="h-5 w-5" />,
  },
  {
    type: "recent_mentions",
    label: "Recent Mentions",
    description: "Scrollable list of latest mentions",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    type: "word_cloud",
    label: "Word Cloud",
    description: "Top keywords visualised as sized text",
    icon: <Type className="h-5 w-5" />,
  },
];

const KPI_METRIC_OPTIONS: Array<{ value: KpiMetric; label: string }> = [
  { value: "total_mentions", label: "Total Mentions" },
  { value: "avg_sentiment", label: "Avg Sentiment" },
  { value: "total_reach", label: "Total Reach" },
  { value: "engagement", label: "Total Engagement" },
];

const CHART_VARIANT_OPTIONS: Array<{ value: ChartVariant; label: string }> = [
  { value: "mention_trend", label: "Mention Trend" },
  { value: "sentiment_breakdown", label: "Sentiment Breakdown" },
  { value: "platform_breakdown", label: "Platform Breakdown" },
];

const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

// ---------------------------------------------------------------------------
// Default widget title helper
// ---------------------------------------------------------------------------

function defaultTitle(type: WidgetType): string {
  switch (type) {
    case "kpi_card": return "KPI Card";
    case "line_chart": return "Mention Trend";
    case "pie_chart": return "Breakdown";
    case "bar_chart": return "Comparison";
    case "recent_mentions": return "Recent Mentions";
    case "word_cloud": return "Word Cloud";
  }
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type PageView = "list" | "builder" | "view";

export default function DashboardsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { projects } = useProjects();

  // Current view state
  const [view, setView] = useState<PageView>("list");
  const [activeDashboard, setActiveDashboard] = useState<CustomDashboard | null>(null);

  // All dashboards from localStorage
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    setDashboards(loadDashboards());
  }, []);

  const canEdit = user ? (hasPermission(user.role, "dashboard") && user.role !== "viewer") : false;

  // ---------------------------------------------------------------------------
  // List view actions
  // ---------------------------------------------------------------------------

  function handleCreate() {
    if (!canEdit) return;
    const now = new Date().toISOString();
    const fresh: CustomDashboard = {
      id: generateId(),
      name: "New Dashboard",
      widgets: [],
      createdAt: now,
      updatedAt: now,
    };
    setActiveDashboard(fresh);
    setView("builder");
  }

  function handleEdit(db: CustomDashboard) {
    if (!canEdit) return;
    setActiveDashboard({ ...db, widgets: db.widgets.map((w) => ({ ...w })) });
    setView("builder");
  }

  function handleView(db: CustomDashboard) {
    setActiveDashboard(db);
    setView("view");
  }

  function handleDeleteConfirm(id: string) {
    const next = dashboards.filter((d) => d.id !== id);
    setDashboards(next);
    saveDashboards(next);
    setDeleteConfirm(null);
  }

  // ---------------------------------------------------------------------------
  // Builder / View back handler
  // ---------------------------------------------------------------------------

  function handleBack() {
    setView("list");
    setActiveDashboard(null);
    // Refresh list from localStorage in case builder saved
    setDashboards(loadDashboards());
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (view === "builder" && activeDashboard) {
    return (
      <DashboardBuilder
        dashboard={activeDashboard}
        projects={projects}
        canEdit={canEdit}
        onBack={handleBack}
      />
    );
  }

  if (view === "view" && activeDashboard) {
    return (
      <DashboardViewer
        dashboard={activeDashboard}
        projects={projects}
        onBack={handleBack}
        onEdit={canEdit ? () => handleEdit(activeDashboard) : undefined}
      />
    );
  }

  // List view
  return (
    <AppShell title="Custom Dashboards">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-400 mt-0.5">
            Build personalised dashboards from your data
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={handleCreate}
            icon={<Plus className="h-4 w-4" />}
          >
            Create Dashboard
          </Button>
        )}
      </div>

      {dashboards.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <LayoutDashboard className="h-12 w-12 text-slate-600" />
              <p className="text-slate-400 font-medium">No custom dashboards yet</p>
              <p className="text-sm text-slate-500 max-w-xs">
                {canEdit
                  ? "Create your first dashboard to visualise the metrics that matter most."
                  : "No dashboards have been created yet."}
              </p>
              {canEdit && (
                <Button
                  className="mt-2"
                  onClick={handleCreate}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Create Dashboard
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((db) => (
            <Card key={db.id} className="glass-card-hover flex flex-col">
              <CardContent className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 truncate">{db.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {db.widgets.length} widget{db.widgets.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <LayoutDashboard className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                </div>

                <p className="text-xs text-slate-500">
                  Last modified {formatDate(db.updatedAt)}
                </p>

                <div className="flex flex-wrap gap-1 mt-auto">
                  {db.widgets.slice(0, 3).map((w) => (
                    <Badge
                      key={w.id}
                      className="text-[10px] border border-white/[0.08] bg-white/[0.04] text-slate-400"
                    >
                      {WIDGET_CATALOG.find((c) => c.type === w.type)?.label ?? w.type}
                    </Badge>
                  ))}
                  {db.widgets.length > 3 && (
                    <Badge className="text-[10px] border border-white/[0.08] bg-white/[0.04] text-slate-500">
                      +{db.widgets.length - 3} more
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <Button size="sm" variant="secondary" onClick={() => handleView(db)}
                    icon={<Eye className="h-3.5 w-3.5" />}
                    className="flex-1"
                  >
                    View
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleEdit(db)}
                        icon={<Edit2 className="h-3.5 w-3.5" />}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(db.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogHeader onClose={() => setDeleteConfirm(null)}>
          Delete Dashboard
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-slate-300">
            Are you sure you want to delete this dashboard? This action cannot be undone.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDeleteConfirm(deleteConfirm)}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}

// ===========================================================================
// Dashboard Builder
// ===========================================================================

interface BuilderProps {
  dashboard: CustomDashboard;
  projects: Array<{ id: number; name: string }>;
  canEdit: boolean;
  onBack: () => void;
}

function DashboardBuilder({ dashboard, projects, canEdit, onBack }: BuilderProps) {
  const [name, setName] = useState(dashboard.name);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(dashboard.widgets);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [saved, setSaved] = useState(false);

  // Pending new widget config state
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingMetric, setPendingMetric] = useState<KpiMetric>("total_mentions");
  const [pendingVariant, setPendingVariant] = useState<ChartVariant>("mention_trend");
  const [pendingTimeRange, setPendingTimeRange] = useState<"7d" | "14d" | "30d" | "90d">("30d");
  const [pendingProjectId, setPendingProjectId] = useState<number | null>(
    projects[0]?.id ?? null
  );

  function openAdd() {
    setSelectedType(null);
    setPendingTitle("");
    setPendingMetric("total_mentions");
    setPendingVariant("mention_trend");
    setPendingTimeRange("30d");
    setPendingProjectId(projects[0]?.id ?? null);
    setAddDialogOpen(true);
  }

  function confirmAdd() {
    if (!selectedType) return;
    const title = pendingTitle.trim() || defaultTitle(selectedType);
    const widget: WidgetConfig = {
      id: generateId(),
      type: selectedType,
      title,
      metric: selectedType === "kpi_card" ? pendingMetric : undefined,
      chartVariant:
        selectedType === "pie_chart" ||
        selectedType === "bar_chart" ||
        selectedType === "line_chart"
          ? pendingVariant
          : undefined,
      timeRange: pendingTimeRange,
      projectId: pendingProjectId,
    };
    setWidgets((prev) => [...prev, widget]);
    setAddDialogOpen(false);
  }

  function removeWidget(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }

  function moveWidget(id: string, direction: "up" | "down" | "left" | "right") {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      let target = idx;
      if (direction === "up" || direction === "left") target = idx - 1;
      if (direction === "down" || direction === "right") target = idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleSave() {
    const now = new Date().toISOString();
    const updated: CustomDashboard = {
      ...dashboard,
      name: name.trim() || "Untitled Dashboard",
      widgets,
      updatedAt: now,
    };
    const existing = loadDashboards();
    const idx = existing.findIndex((d) => d.id === dashboard.id);
    if (idx >= 0) {
      existing[idx] = updated;
    } else {
      existing.push(updated);
    }
    saveDashboards(existing);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell title="Dashboard Builder">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex-1 min-w-[200px] max-w-xs">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(
              "w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-sm font-medium text-slate-100",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50",
              "placeholder:text-slate-500 transition-all duration-200"
            )}
            placeholder="Dashboard name"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={openAdd}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Add Widget
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            icon={saved ? <Activity className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          >
            {saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Widget grid */}
      {widgets.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <Plus className="h-10 w-10 text-slate-600" />
              <p className="text-slate-400 font-medium">No widgets yet</p>
              <p className="text-sm text-slate-500">
                Click "Add Widget" to start building your dashboard.
              </p>
              <Button
                size="sm"
                className="mt-1"
                onClick={openAdd}
                icon={<Plus className="h-4 w-4" />}
              >
                Add Widget
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget, idx) => (
            <BuilderWidgetCard
              key={widget.id}
              widget={widget}
              index={idx}
              total={widgets.length}
              onMove={moveWidget}
              onRemove={removeWidget}
            />
          ))}
        </div>
      )}

      {/* Add widget dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogHeader onClose={() => setAddDialogOpen(false)}>
          Add Widget
        </DialogHeader>
        <DialogContent className="space-y-4">
          {/* Step 1: pick type */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Widget Type
            </p>
            <div className="grid grid-cols-2 gap-2">
              {WIDGET_CATALOG.map((cat) => (
                <button
                  key={cat.type}
                  onClick={() => setSelectedType(cat.type)}
                  className={cn(
                    "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all duration-150",
                    selectedType === cat.type
                      ? "border-indigo-500/60 bg-indigo-500/10 text-slate-100"
                      : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-300"
                  )}
                >
                  <span className={cn("shrink-0 mt-0.5", selectedType === cat.type ? "text-indigo-400" : "")}>
                    {cat.icon}
                  </span>
                  <div>
                    <p className="text-xs font-medium">{cat.label}</p>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{cat.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: configure */}
          {selectedType && (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Configuration
              </p>

              {/* Title */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Widget Title</label>
                <input
                  value={pendingTitle}
                  onChange={(e) => setPendingTitle(e.target.value)}
                  placeholder={defaultTitle(selectedType)}
                  className={cn(
                    "w-full h-9 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 text-sm text-slate-200",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all duration-200",
                    "placeholder:text-slate-500"
                  )}
                />
              </div>

              {/* KPI metric selector */}
              {selectedType === "kpi_card" && (
                <Select
                  label="Metric"
                  value={pendingMetric}
                  onValueChange={(v) => setPendingMetric(v as KpiMetric)}
                  options={KPI_METRIC_OPTIONS}
                />
              )}

              {/* Chart variant */}
              {(selectedType === "pie_chart" ||
                selectedType === "bar_chart" ||
                selectedType === "line_chart") && (
                <Select
                  label="Data Source"
                  value={pendingVariant}
                  onValueChange={(v) => setPendingVariant(v as ChartVariant)}
                  options={CHART_VARIANT_OPTIONS}
                />
              )}

              {/* Time range */}
              <Select
                label="Time Range"
                value={pendingTimeRange}
                onValueChange={(v) => setPendingTimeRange(v as "7d" | "14d" | "30d" | "90d")}
                options={TIME_RANGE_OPTIONS}
              />

              {/* Project */}
              {projects.length > 0 && (
                <Select
                  label="Project"
                  value={pendingProjectId?.toString() ?? ""}
                  onValueChange={(v) => setPendingProjectId(Number(v))}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmAdd} disabled={!selectedType}>Add Widget</Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Builder widget card (configuration preview, no live data)
// ---------------------------------------------------------------------------

interface BuilderWidgetCardProps {
  widget: WidgetConfig;
  index: number;
  total: number;
  onMove: (id: string, dir: "up" | "down" | "left" | "right") => void;
  onRemove: (id: string) => void;
}

function BuilderWidgetCard({ widget, index, total, onMove, onRemove }: BuilderWidgetCardProps) {
  const catalog = WIDGET_CATALOG.find((c) => c.type === widget.type);

  return (
    <Card className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-indigo-400 shrink-0">{catalog?.icon}</span>
          <span className="text-sm font-medium text-slate-200 truncate">{widget.title}</span>
        </div>
        <button
          onClick={() => onRemove(widget.id)}
          className="ml-2 shrink-0 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Remove widget"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1 space-y-1.5">
        <p className="text-xs text-slate-500">{catalog?.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {widget.metric && (
            <Badge className="text-[10px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              {KPI_METRIC_OPTIONS.find((o) => o.value === widget.metric)?.label}
            </Badge>
          )}
          {widget.chartVariant && (
            <Badge className="text-[10px] border border-purple-500/30 bg-purple-500/10 text-purple-300">
              {CHART_VARIANT_OPTIONS.find((o) => o.value === widget.chartVariant)?.label}
            </Badge>
          )}
          {widget.timeRange && (
            <Badge className="text-[10px] border border-white/[0.08] bg-white/[0.04] text-slate-400">
              {TIME_RANGE_OPTIONS.find((o) => o.value === widget.timeRange)?.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Reorder controls */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-t border-white/[0.04]">
        <button
          onClick={() => onMove(widget.id, "left")}
          disabled={index === 0}
          aria-label="Move left"
          className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(widget.id, "up")}
          disabled={index === 0}
          aria-label="Move up"
          className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] text-slate-600 tabular-nums px-1">
          {index + 1}/{total}
        </span>
        <button
          onClick={() => onMove(widget.id, "down")}
          disabled={index === total - 1}
          aria-label="Move down"
          className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(widget.id, "right")}
          disabled={index === total - 1}
          aria-label="Move right"
          className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

// ===========================================================================
// Dashboard Viewer
// ===========================================================================

interface ViewerProps {
  dashboard: CustomDashboard;
  projects: Array<{ id: number; name: string }>;
  onBack: () => void;
  onEdit?: () => void;
}

interface MetricsCache {
  [projectId: number]: {
    [timeRange: string]: {
      data: Record<string, unknown>;
      fetchedAt: number;
    };
  };
}

function DashboardViewer({ dashboard, projects, onBack, onEdit }: ViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [metricsCache, setMetricsCache] = useState<MetricsCache>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Collect unique (projectId, timeRange) pairs required by widgets
  const fetchTargets = React.useMemo(() => {
    const map = new Map<string, { projectId: number; days: number }>();
    dashboard.widgets.forEach((w) => {
      const pid = w.projectId ?? projects[0]?.id;
      if (!pid) return;
      const days = w.timeRange === "7d" ? 7 : w.timeRange === "14d" ? 14 : w.timeRange === "90d" ? 90 : 30;
      const key = `${pid}-${days}`;
      if (!map.has(key)) map.set(key, { projectId: pid, days });
    });
    return Array.from(map.values());
  }, [dashboard.widgets, projects]);

  const fetchAllMetrics = useCallback(async () => {
    if (fetchTargets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        fetchTargets.map(async ({ projectId, days }) => {
          const data = await api.getDashboardMetrics(projectId, days);
          return { projectId, days, data };
        })
      );
      const cache: MetricsCache = {};
      results.forEach(({ projectId, days, data }) => {
        if (!cache[projectId]) cache[projectId] = {};
        cache[projectId][`${days}`] = { data: data as Record<string, unknown>, fetchedAt: Date.now() };
      });
      setMetricsCache(cache);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      console.error("Failed to fetch dashboard metrics:", err);
      setError("Failed to load widget data. Some widgets may be incomplete.");
    } finally {
      setLoading(false);
    }
  }, [fetchTargets]);

  // Initial fetch
  useEffect(() => {
    fetchAllMetrics();
  }, [fetchAllMetrics]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchAllMetrics();
    }, 60_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchAllMetrics]);

  function getMetrics(projectId: number | undefined | null, timeRange: string | undefined) {
    const pid = projectId ?? projects[0]?.id;
    const days = timeRange === "7d" ? 7 : timeRange === "14d" ? 14 : timeRange === "90d" ? 90 : 30;
    return metricsCache[pid ?? 0]?.[`${days}`]?.data ?? null;
  }

  const containerClass = cn(
    fullscreen && "fixed inset-0 z-40 bg-slate-950 overflow-y-auto p-6"
  );

  const inner = (
    <AppShell title={dashboard.name}>
      <div className={containerClass}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <h1 className="text-base font-semibold text-slate-100">{dashboard.name}</h1>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Last refreshed{" "}
              {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchAllMetrics}
              loading={loading}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
            {onEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onEdit}
                icon={<Edit2 className="h-3.5 w-3.5" />}
              >
                Edit
              </Button>
            )}
            <button
              onClick={() => setFullscreen((f) => !f)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {dashboard.widgets.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-3">
                <LayoutDashboard className="h-10 w-10 text-slate-600" />
                <p className="text-slate-500 text-sm">This dashboard has no widgets.</p>
                {onEdit && (
                  <Button size="sm" onClick={onEdit} icon={<Edit2 className="h-4 w-4" />}>
                    Edit Dashboard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.widgets.map((widget) => {
              const metrics = getMetrics(widget.projectId, widget.timeRange);
              return (
                <LiveWidgetCard
                  key={widget.id}
                  widget={widget}
                  metrics={metrics}
                  loading={loading && !metrics}
                  projects={projects}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );

  return inner;
}

// ---------------------------------------------------------------------------
// Live widget card — renders actual data
// ---------------------------------------------------------------------------

interface LiveWidgetCardProps {
  widget: WidgetConfig;
  metrics: Record<string, unknown> | null;
  loading: boolean;
  projects: Array<{ id: number; name: string }>;
}

function LiveWidgetCard({ widget, metrics, loading, projects }: LiveWidgetCardProps) {
  const catalog = WIDGET_CATALOG.find((c) => c.type === widget.type);
  const projectName = projects.find((p) => p.id === widget.projectId)?.name ?? "—";

  return (
    <Card className={cn(
      widget.type === "recent_mentions" || widget.type === "word_cloud"
        ? "sm:col-span-2 xl:col-span-2"
        : ""
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400">{catalog?.icon}</span>
            <CardTitle>{widget.title}</CardTitle>
          </div>
          <span className="text-[10px] text-slate-500">{projectName}</span>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner />
          </div>
        ) : (
          <LiveWidgetBody widget={widget} metrics={metrics} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Widget body — delegates to correct renderer
// ---------------------------------------------------------------------------

interface LiveWidgetBodyProps {
  widget: WidgetConfig;
  metrics: Record<string, unknown> | null;
}

function LiveWidgetBody({ widget, metrics }: LiveWidgetBodyProps) {
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <AlertCircle className="h-6 w-6 text-slate-600" />
        <p className="text-xs text-slate-500">No data available</p>
      </div>
    );
  }

  switch (widget.type) {
    case "kpi_card":
      return <KpiCardWidget metric={widget.metric ?? "total_mentions"} metrics={metrics} />;
    case "line_chart":
    case "pie_chart":
    case "bar_chart":
      return (
        <WidgetCharts
          type={widget.type}
          variant={widget.chartVariant ?? "mention_trend"}
          metrics={metrics}
        />
      );
    case "recent_mentions":
      return <RecentMentionsWidget metrics={metrics} />;
    case "word_cloud":
      return <WordCloudWidget metrics={metrics} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCardWidget({
  metric,
  metrics,
}: {
  metric: KpiMetric;
  metrics: Record<string, unknown>;
}) {
  let value: number | string = "—";
  let label = "";
  let color = "text-slate-100";

  switch (metric) {
    case "total_mentions": {
      const v = Number(metrics.total_mentions ?? 0);
      value = formatNumber(v);
      label = "Total Mentions";
      break;
    }
    case "avg_sentiment": {
      const raw = metrics.sentiment as Record<string, number> | undefined;
      const v = raw?.average_score ?? Number(metrics.avg_sentiment ?? 0);
      value = v.toFixed(2);
      label = "Avg Sentiment";
      color = v > 0.3 ? "text-emerald-400" : v < -0.3 ? "text-red-400" : "text-slate-200";
      break;
    }
    case "total_reach": {
      const eng = metrics.engagement as Record<string, number> | undefined;
      const v = eng?.total_reach ?? Number(metrics.total_reach ?? 0);
      value = formatNumber(v);
      label = "Total Reach";
      break;
    }
    case "engagement": {
      const eng = metrics.engagement as Record<string, number> | undefined;
      const v =
        (eng?.total_likes ?? 0) +
        (eng?.total_shares ?? 0) +
        (eng?.total_comments ?? 0);
      value = formatNumber(v);
      label = "Total Engagement";
      break;
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-4 text-center gap-1">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={cn("text-4xl font-bold tracking-tight", color)}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Mentions
// ---------------------------------------------------------------------------

interface MentionRow {
  id: number;
  platform: string;
  author_name?: string;
  content?: string;
  text?: string;
  sentiment?: string;
  created_at?: string;
}

function RecentMentionsWidget({ metrics }: { metrics: Record<string, unknown> }) {
  const mentions = (metrics.recent_mentions ?? []) as MentionRow[];

  if (!mentions.length) {
    return (
      <p className="text-xs text-slate-500 text-center py-6">No recent mentions</p>
    );
  }

  return (
    <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {mentions.slice(0, 10).map((m, i) => {
        const text = m.content ?? m.text ?? "";
        const sentiment = m.sentiment ?? "neutral";
        const sentimentColor =
          sentiment === "positive"
            ? "text-emerald-400"
            : sentiment === "negative"
            ? "text-red-400"
            : "text-slate-400";

        return (
          <li
            key={m.id ?? i}
            className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/[0.03] transition-colors"
          >
            <span className="text-xs font-medium text-indigo-300 capitalize shrink-0 mt-0.5">
              {m.platform}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">{m.author_name ?? "Unknown"}</p>
              <p className="text-[11px] text-slate-500 truncate">{text.slice(0, 80)}</p>
            </div>
            <span className={cn("text-[10px] shrink-0 capitalize", sentimentColor)}>
              {sentiment}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Word Cloud
// ---------------------------------------------------------------------------

function WordCloudWidget({ metrics }: { metrics: Record<string, unknown> }) {
  const contributors = (metrics.top_contributors ?? []) as Array<{
    name?: string;
    mentions?: number;
  }>;

  if (!contributors.length) {
    return (
      <p className="text-xs text-slate-500 text-center py-6">No keyword data</p>
    );
  }

  const max = Math.max(...contributors.map((c) => c.mentions ?? 1));

  const CLOUD_COLORS = [
    "#818cf8",
    "#a78bfa",
    "#34d399",
    "#60a5fa",
    "#f472b6",
    "#facc15",
    "#fb923c",
    "#38bdf8",
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-2 min-h-[80px]">
      {contributors.slice(0, 20).map((c, i) => {
        const ratio = (c.mentions ?? 1) / max;
        const size = Math.round(12 + ratio * 20);
        const color = CLOUD_COLORS[i % CLOUD_COLORS.length];
        return (
          <span
            key={c.name ?? i}
            style={{ fontSize: `${size}px`, color }}
            className="font-medium leading-tight cursor-default select-none transition-transform hover:scale-110"
            title={`${c.mentions} mentions`}
          >
            {c.name}
          </span>
        );
      })}
    </div>
  );
}
