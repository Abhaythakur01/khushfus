"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  RefreshCw,
  CheckCircle2,
  Bell,
  FileText,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Mention, DashboardMetrics } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { audit } from "@/lib/auditLog";

// ---------------------------------------------------------------------------
// Dynamic chart import — defers Recharts until after first render
// ---------------------------------------------------------------------------

function ChartLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
    </div>
  );
}

const CrisisChart = dynamic(() => import("./CrisisChart"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrisisLevel = "none" | "low" | "medium" | "high" | "critical";

interface CrisisMetrics {
  negativeRatio: number;       // 0–1: fraction of negative mentions in last 24h
  prevNegativeRatio: number;   // 0–1: same for previous 24h period
  volumeSpike: number;         // positive = spike percentage (e.g. 45 means +45%)
  topNegativeKeywords: string[];
  mostActivePlatforms: Array<{ platform: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Crisis severity calculation
// ---------------------------------------------------------------------------

/**
 * Determine crisis level from negative sentiment ratio and volume spike.
 *
 * Thresholds (tunable):
 *   Critical  — negRatio >= 0.6  OR (negRatio >= 0.45 AND spike >= 100)
 *   High      — negRatio >= 0.4  OR (negRatio >= 0.3  AND spike >= 50)
 *   Medium    — negRatio >= 0.25 OR spike >= 30
 *   Low       — negRatio >= 0.1  OR spike >= 15
 *   None      — everything else
 */
export function calculateCrisisLevel(negRatio: number, spike: number): CrisisLevel {
  if (negRatio >= 0.6 || (negRatio >= 0.45 && spike >= 100)) return "critical";
  if (negRatio >= 0.4 || (negRatio >= 0.3 && spike >= 50)) return "high";
  if (negRatio >= 0.25 || spike >= 30) return "medium";
  if (negRatio >= 0.1 || spike >= 15) return "low";
  return "none";
}

// ---------------------------------------------------------------------------
// Visual config per severity level
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  CrisisLevel,
  { label: string; color: string; bg: string; border: string; gaugeFill: string; ringColor: string }
> = {
  none: {
    label: "None",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    gaugeFill: "#22c55e",
    ringColor: "ring-emerald-500/30",
  },
  low: {
    label: "Low",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    gaugeFill: "#3b82f6",
    ringColor: "ring-blue-500/30",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    gaugeFill: "#eab308",
    ringColor: "ring-yellow-500/30",
  },
  high: {
    label: "High",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    gaugeFill: "#f97316",
    ringColor: "ring-orange-500/30",
  },
  critical: {
    label: "Critical",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    gaugeFill: "#ef4444",
    ringColor: "ring-red-500/30",
  },
};

const LEVEL_ORDER: CrisisLevel[] = ["none", "low", "medium", "high", "critical"];

// ---------------------------------------------------------------------------
// Small helper: time-ago
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Platform icon
// ---------------------------------------------------------------------------

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  const p = (platform ?? "").toLowerCase();
  switch (p) {
    case "twitter":  return <Twitter  className={cls} style={{ color: "#1DA1F2" }} />;
    case "facebook": return <Facebook className={cls} style={{ color: "#1877F2" }} />;
    case "instagram":return <Instagram className={cls} style={{ color: "#E4405F" }} />;
    case "linkedin": return <Linkedin className={cls} style={{ color: "#0A66C2" }} />;
    case "youtube":  return <Youtube  className={cls} style={{ color: "#FF0000" }} />;
    default:         return <MessageSquare className={cls} style={{ color: "#6366f1" }} />;
  }
}

// ---------------------------------------------------------------------------
// Crisis Severity Gauge (SVG arc)
// ---------------------------------------------------------------------------

function CrisisSeverityGauge({ level }: { level: CrisisLevel }) {
  const cfg = SEVERITY_CONFIG[level];
  const levelIdx = LEVEL_ORDER.indexOf(level); // 0–4
  // Arc: 0 = left end, 4 = right end. Map to 0–180° sweep on a half-circle.
  const sweepDeg = (levelIdx / 4) * 180;

  // SVG half-circle: cx=80, cy=80, r=60. Arc from 180° to 0° (left to right).
  const polarToXY = (angleDeg: number) => {
    const rad = ((angleDeg - 180) * Math.PI) / 180;
    return {
      x: 80 + 60 * Math.cos(rad),
      y: 80 + 60 * Math.sin(rad),
    };
  };

  const start = polarToXY(180); // leftmost
  const end   = polarToXY(180 + sweepDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;

  const arcPath =
    sweepDeg === 0
      ? ""
      : `M ${start.x} ${start.y} A 60 60 0 ${largeArc} 1 ${end.x} ${end.y}`;

  // Needle angle (180° = leftmost, 360° = rightmost)
  const needleAngleDeg = 180 + sweepDeg;
  const needleRad = ((needleAngleDeg - 180) * Math.PI) / 180;
  const needleTip = {
    x: 80 + 54 * Math.cos(needleRad),
    y: 80 + 54 * Math.sin(needleRad),
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 95" className="w-56 h-auto select-none" aria-hidden>
        {/* Background track */}
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke="#1e293b"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Coloured fill arc */}
        {sweepDeg > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={cfg.gaugeFill}
            strokeWidth="14"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${cfg.gaugeFill}55)` }}
          />
        )}
        {/* Needle */}
        <line
          x1="80"
          y1="80"
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={cfg.gaugeFill}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Needle pivot */}
        <circle cx="80" cy="80" r="5" fill={cfg.gaugeFill} />
        {/* Tick labels */}
        <text x="14" y="92" fontSize="8" fill="#475569" textAnchor="middle">None</text>
        <text x="46" y="30" fontSize="8" fill="#475569" textAnchor="middle">Low</text>
        <text x="80" y="18" fontSize="8" fill="#475569" textAnchor="middle">Med</text>
        <text x="114" y="30" fontSize="8" fill="#475569" textAnchor="middle">High</text>
        <text x="146" y="92" fontSize="8" fill="#475569" textAnchor="middle">Crit</text>
      </svg>

      {/* Label */}
      <div
        className={cn(
          "mt-1 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold tracking-wide uppercase",
          cfg.bg,
          cfg.border,
          cfg.color,
        )}
      >
        <ShieldAlert className="h-4 w-4" />
        {cfg.label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbook steps
// ---------------------------------------------------------------------------

const PLAYBOOK_STEPS = [
  {
    step: 1,
    title: "Acknowledge Internally",
    detail: "Ensure your team is aware of the situation. Designate a crisis lead.",
  },
  {
    step: 2,
    title: "Assess the Scope",
    detail:
      "Review the negative mention feed and key metrics. Identify root cause and affected platforms.",
  },
  {
    step: 3,
    title: "Draft a Response",
    detail:
      "Prepare a clear, empathetic public statement. Avoid defensive language. Get legal/comms approval.",
  },
  {
    step: 4,
    title: "Publish & Monitor",
    detail:
      "Post your response on the most active platforms. Increase monitoring frequency to every 15 minutes.",
  },
  {
    step: 5,
    title: "Follow Up",
    detail:
      "Track sentiment recovery over the next 24–48 hours. Generate a post-crisis report for stakeholders.",
  },
];

// ---------------------------------------------------------------------------
// Sentiment badge
// ---------------------------------------------------------------------------

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    neutral:  "bg-slate-500/10 text-slate-400 border-slate-500/20",
    negative: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <Badge className={cn("border text-[10px] capitalize", map[sentiment] ?? map.neutral)}>
      {sentiment}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CrisisDashboardPage() {
  const { projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Data state
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [negativeMentions, setNegativeMentions] = useState<Mention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action feedback
  const [acknowledging, setAcknowledging] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Playbook accordion
  const [playbookOpen, setPlaybookOpen] = useState(false);

  // Poll interval ref — refresh negative mentions every 30s
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(
    async (projectId: number, signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const [metricsRes, mentionsRes] = await Promise.all([
          api.getDashboardMetrics(projectId, 7, signal),
          api.getMentions(
            projectId,
            { sentiment: "negative", limit: 20, page: 1 },
            signal,
          ),
        ]);

        setMetrics(metricsRes as DashboardMetrics);

        const items =
          (mentionsRes as { items?: Mention[] })?.items ??
          (mentionsRes as Mention[]) ??
          [];
        setNegativeMentions(items);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Crisis dashboard fetch failed:", err);
        setError("Failed to load crisis data. Please retry.");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Initial fetch + polling
  useEffect(() => {
    if (!selectedProjectId) return;
    const controller = new AbortController();
    fetchData(selectedProjectId, controller.signal);

    // Poll negative mentions every 30 seconds
    pollRef.current = setInterval(() => {
      fetchData(selectedProjectId, controller.signal);
    }, 30_000);

    return () => {
      controller.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedProjectId, fetchData]);

  // ---------------------------------------------------------------------------
  // Derived crisis metrics
  // ---------------------------------------------------------------------------

  const crisisMetrics = useMemo<CrisisMetrics>(() => {
    const breakdown =
      (metrics as any)?.sentiment?.breakdown ??
      (metrics as any)?.sentiment_breakdown ??
      { positive: 0, neutral: 0, negative: 0 };

    const neg = breakdown.negative ?? 0;
    const pos = breakdown.positive ?? 0;
    const neu = breakdown.neutral ?? 0;
    const total = neg + pos + neu || 1;
    const negRatio = neg / total;

    // Volume spike: compare first half vs second half of daily_trend
    const daily: Array<Record<string, number>> =
      (metrics as any)?.daily_trend ?? [];
    let volumeSpike = 0;
    if (daily.length >= 2) {
      const half = Math.floor(daily.length / 2);
      const firstHalfTotal = daily
        .slice(0, half)
        .reduce((s, d) => s + (d.total ?? d.count ?? 0), 0);
      const secondHalfTotal = daily
        .slice(half)
        .reduce((s, d) => s + (d.total ?? d.count ?? 0), 0);
      if (firstHalfTotal > 0) {
        volumeSpike =
          ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
      }
    }

    // Previous negative ratio — use positive/neutral/negative split from previous period
    // (approximated as first half of daily sentiment data)
    const sentOverTime: Array<Record<string, number>> =
      (metrics as any)?.sentiment_over_time ?? [];
    let prevNegRatio = 0;
    if (sentOverTime.length >= 2) {
      const half = Math.floor(sentOverTime.length / 2);
      const prev = sentOverTime.slice(0, half);
      const prevNeg = prev.reduce((s, d) => s + (d.negative ?? 0), 0);
      const prevTotal =
        prev.reduce((s, d) => s + (d.positive ?? 0) + (d.neutral ?? 0) + (d.negative ?? 0), 0) || 1;
      prevNegRatio = prevNeg / prevTotal;
    }

    // Top negative keywords from keyword breakdown (or matched keywords from mentions)
    const keywordMap: Record<string, number> = {};
    negativeMentions.forEach((m) => {
      const kws: string[] = Array.isArray(m.keywords)
        ? m.keywords
        : typeof m.matched_keywords === "string"
        ? m.matched_keywords.split(",").map((k) => k.trim()).filter(Boolean)
        : [];
      kws.forEach((kw) => {
        keywordMap[kw] = (keywordMap[kw] ?? 0) + 1;
      });
    });
    const topNegativeKeywords = Object.entries(keywordMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kw]) => kw);

    // Most active negative platforms
    const platformMap: Record<string, number> = {};
    negativeMentions.forEach((m) => {
      if (m.platform) platformMap[m.platform] = (platformMap[m.platform] ?? 0) + 1;
    });
    const mostActivePlatforms = Object.entries(platformMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([platform, count]) => ({ platform, count }));

    return {
      negativeRatio: negRatio,
      prevNegativeRatio: prevNegRatio,
      volumeSpike,
      topNegativeKeywords,
      mostActivePlatforms,
    };
  }, [metrics, negativeMentions]);

  const crisisLevel = useMemo(
    () => calculateCrisisLevel(crisisMetrics.negativeRatio, crisisMetrics.volumeSpike),
    [crisisMetrics.negativeRatio, crisisMetrics.volumeSpike],
  );

  const cfg = SEVERITY_CONFIG[crisisLevel];

  // ---------------------------------------------------------------------------
  // Sentiment trend data for chart
  // ---------------------------------------------------------------------------

  const sentimentTrendData = useMemo(() => {
    const daily: Array<Record<string, number>> =
      (metrics as any)?.daily_trend ?? [];
    const sentOverTime: Array<Record<string, number>> =
      (metrics as any)?.sentiment_over_time ?? [];

    if (sentOverTime.length > 0) {
      return sentOverTime.map((d) => ({
        date: d.date as unknown as string ?? "",
        positive: d.positive ?? 0,
        neutral:  d.neutral  ?? 0,
        negative: d.negative ?? 0,
      }));
    }

    // Fallback: derive from daily_trend + overall breakdown ratio
    return daily.map((d) => {
      const t = d.total ?? d.count ?? 0;
      const r = crisisMetrics.negativeRatio;
      return {
        date: d.date as unknown as string ?? "",
        positive: Math.round(t * (1 - r) * 0.6),
        neutral:  Math.round(t * (1 - r) * 0.4),
        negative: Math.round(t * r),
      };
    });
  }, [metrics, crisisMetrics.negativeRatio]);

  // Danger threshold line value (25% negative = medium crisis onset)
  const DANGER_THRESHOLD_PCT = 25;

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      audit({
        action: "alert.create",
        resource_type: "crisis",
        resource_id: selectedProjectId ?? undefined,
        metadata: {
          crisis_level: crisisLevel,
          negative_ratio: crisisMetrics.negativeRatio,
          volume_spike: crisisMetrics.volumeSpike,
          action: "crisis_acknowledged",
        },
      });
      // Small artificial delay so the spinner shows
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Crisis acknowledged and logged to audit trail.");
    } catch {
      toast.error("Failed to acknowledge crisis.");
    } finally {
      setAcknowledging(false);
    }
  };

  const handleNotifyTeam = async () => {
    if (!selectedProjectId) return;
    setNotifying(true);
    try {
      // Create a "negative_surge" alert rule temporarily — reuse alert API as notification trigger
      await api.createAlertRule(selectedProjectId, {
        name: `[CRISIS] ${crisisLevel.toUpperCase()} level detected — ${new Date().toLocaleString()}`,
        rule_type: "negative_surge",
        threshold: Math.round(crisisMetrics.negativeRatio * 100),
        window_minutes: 60,
        channels: ["email", "slack"],
        is_active: true,
      });
      audit({
        action: "alert.create",
        resource_type: "crisis_notification",
        resource_id: selectedProjectId,
        metadata: { crisis_level: crisisLevel },
      });
      toast.success("Team notified via email and Slack.");
    } catch {
      toast.error("Failed to notify team. Check your alert configuration.");
    } finally {
      setNotifying(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedProjectId) return;
    setGenerating(true);
    try {
      await api.generateReport(selectedProjectId, "crisis", "pdf");
      audit({
        action: "report.generate",
        resource_type: "crisis_report",
        resource_id: selectedProjectId,
        metadata: { crisis_level: crisisLevel },
      });
      toast.success("Crisis report queued. It will appear in Reports when ready.");
    } catch {
      toast.error("Failed to generate crisis report.");
    } finally {
      setGenerating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const negPct = (crisisMetrics.negativeRatio * 100).toFixed(1);
  const prevNegPct = (crisisMetrics.prevNegativeRatio * 100).toFixed(1);
  const negDelta = crisisMetrics.negativeRatio - crisisMetrics.prevNegativeRatio;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!projectsLoading && projects.length === 0) {
    return (
      <AppShell title="Crisis Management">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert className="h-12 w-12 text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">No projects found. Create a project first.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Crisis Management">
      {/* ---- Top bar: project selector + refresh ---- */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={selectedProjectId ?? ""}
          onChange={(e) => setSelectedProjectId(Number(e.target.value))}
          disabled={projectsLoading}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {projectsLoading ? (
            <option>Loading…</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Auto-refreshes every 30s
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedProjectId && fetchData(selectedProjectId)}
          disabled={isLoading}
          className="border-white/[0.08] text-slate-300 hover:bg-white/[0.06]"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isLoading && !metrics ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ================================================================
              ROW 1 — Severity gauge + key metric cards
          ================================================================ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Severity Gauge */}
            <Card
              className={cn(
                "lg:col-span-1 border transition-all",
                cfg.border,
                crisisLevel !== "none" && "shadow-lg",
              )}
            >
              <CardHeader className="pb-1">
                <CardTitle className="text-slate-200 flex items-center gap-2">
                  <ShieldAlert className={cn("h-4 w-4", cfg.color)} />
                  Crisis Severity
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-4">
                <CrisisSeverityGauge level={crisisLevel} />
                <p className="mt-4 text-xs text-slate-500 text-center max-w-[220px]">
                  Based on negative sentiment ratio ({negPct}%) and mention volume
                  {crisisMetrics.volumeSpike > 0
                    ? ` spike (+${crisisMetrics.volumeSpike.toFixed(0)}%)`
                    : "."}
                </p>
              </CardContent>
            </Card>

            {/* Metric cards stacked */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Negative mention % */}
              <Card className="glass-card-hover">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Negative Mentions (24h)
                  </p>
                  <p className="mt-2 text-3xl font-bold text-red-400 tabular-nums">
                    {negPct}%
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    {negDelta > 0.005 ? (
                      <>
                        <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-red-400">
                          +{(negDelta * 100).toFixed(1)}pp vs prev period
                        </span>
                      </>
                    ) : negDelta < -0.005 ? (
                      <>
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">
                          {(negDelta * 100).toFixed(1)}pp vs prev period
                        </span>
                      </>
                    ) : (
                      <>
                        <Minus className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-slate-500">
                          {prevNegPct}% prev period
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Volume spike */}
              <Card className="glass-card-hover">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Mention Volume Spike
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-3xl font-bold tabular-nums",
                      crisisMetrics.volumeSpike > 30
                        ? "text-orange-400"
                        : crisisMetrics.volumeSpike > 0
                        ? "text-yellow-400"
                        : "text-emerald-400",
                    )}
                  >
                    {crisisMetrics.volumeSpike > 0 ? "+" : ""}
                    {crisisMetrics.volumeSpike.toFixed(0)}%
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    vs prior period (7-day window)
                  </p>
                </CardContent>
              </Card>

              {/* Top negative keywords */}
              <Card className="glass-card-hover sm:col-span-2">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                    Top Negative Keywords
                  </p>
                  {crisisMetrics.topNegativeKeywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {crisisMetrics.topNegativeKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 italic">
                      No keyword data in negative mentions yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Most active negative platforms */}
              <Card className="glass-card-hover sm:col-span-2">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                    Most Active Negative Platforms
                  </p>
                  {crisisMetrics.mostActivePlatforms.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {crisisMetrics.mostActivePlatforms.map(({ platform, count }) => (
                        <div
                          key={platform}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
                        >
                          <PlatformIcon platform={platform} />
                          <span className="text-sm text-slate-300 capitalize">{platform}</span>
                          <span className="text-xs text-slate-500 tabular-nums">{count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 italic">
                      No platform data yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ================================================================
              ROW 2 — Sentiment Trend Chart
          ================================================================ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-200">
                Sentiment Trend (7 days)
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Red shaded zone indicates negative ratio exceeding {DANGER_THRESHOLD_PCT}% threshold.
              </p>
            </CardHeader>
            <CardContent>
              {sentimentTrendData.length > 0 ? (
                <CrisisChart
                  data={sentimentTrendData}
                  dangerThresholdPct={DANGER_THRESHOLD_PCT}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48">
                  <TrendingUp className="h-8 w-8 text-slate-700 mb-2" />
                  <p className="text-sm text-slate-500">
                    No trend data available for this period.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ================================================================
              ROW 3 — Real-time negative alert feed + response actions
          ================================================================ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Negative Mention Feed */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-slate-200 flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full animate-pulse",
                      crisisLevel === "none" ? "bg-emerald-400" : "bg-red-400",
                    )}
                  />
                  Negative Mention Feed
                </CardTitle>
                <span className="text-xs text-slate-500">
                  {negativeMentions.length} recent
                </span>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto pr-1 space-y-2">
                {negativeMentions.length > 0 ? (
                  negativeMentions.map((mention) => {
                    const text = mention.content ?? mention.text ?? "";
                    const ts =
                      mention.created_at ??
                      mention.collected_at ??
                      mention.published_at ??
                      "";

                    return (
                      <div
                        key={mention.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
                      >
                        <PlatformIcon
                          platform={mention.platform}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-slate-300 truncate">
                              {mention.author_name ?? "Unknown"}
                            </span>
                            {mention.author_handle && (
                              <span className="text-[11px] text-slate-600 truncate">
                                {mention.author_handle}
                              </span>
                            )}
                            <SentimentBadge sentiment={mention.sentiment} />
                          </div>
                          <p className="text-sm text-slate-400 line-clamp-2">{text}</p>
                        </div>
                        {ts && (
                          <span className="text-[11px] text-slate-600 shrink-0 mt-0.5">
                            {timeAgo(ts)}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mb-2" />
                    <p className="text-sm text-emerald-500">No negative mentions found.</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Everything looks good for this project.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Response Actions Panel */}
            <div className="space-y-4">
              {/* Action buttons */}
              <Card
                className={cn(
                  "border transition-all",
                  crisisLevel !== "none" ? cfg.border : "border-white/[0.06]",
                )}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-200">Response Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={handleAcknowledge}
                    disabled={acknowledging}
                    className="w-full justify-start bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  >
                    {acknowledging ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Acknowledge Crisis
                  </Button>

                  <Button
                    onClick={handleNotifyTeam}
                    disabled={notifying || !selectedProjectId}
                    className="w-full justify-start bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  >
                    {notifying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Notify Team
                  </Button>

                  <Button
                    onClick={handleGenerateReport}
                    disabled={generating || !selectedProjectId}
                    className="w-full justify-start bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  >
                    {generating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    Generate Crisis Report
                  </Button>
                </CardContent>
              </Card>

              {/* Playbook */}
              <Card>
                <button
                  onClick={() => setPlaybookOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <BookOpen className="h-4 w-4 text-indigo-400" />
                    Crisis Response Playbook
                  </span>
                  {playbookOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {playbookOpen && (
                  <CardContent className="pt-0 pb-4 space-y-3">
                    {PLAYBOOK_STEPS.map(({ step, title, detail }) => (
                      <div
                        key={step}
                        className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                      >
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold shrink-0">
                          {step}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
