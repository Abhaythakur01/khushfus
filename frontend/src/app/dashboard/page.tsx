"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Heart,
  Share2,
  Eye,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Clock,
  ChevronDown,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { PLATFORM_COLORS, SENTIMENT_BADGE } from "@/lib/constants";
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
import { Spinner } from "@/components/ui/spinner";
import { WordCloud } from "@/components/charts/WordCloud";
import { GeoMap } from "@/components/charts/GeoMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: number;
  name: string;
}

interface DashboardData {
  total_mentions: number;
  sentiment: {
    breakdown: { positive: number; negative: number; neutral: number };
    average_score: number;
  };
  platforms: Record<string, number>;
  engagement: {
    total_likes: number;
    total_shares: number;
    total_comments: number;
    total_reach: number;
  };
  top_contributors: Array<{
    name: string;
    handle: string;
    followers: number;
    platform: string;
    mentions: number;
  }>;
  daily_trend: Array<{ date: string; mentions: number }>;
}

interface MentionItem {
  id: number;
  platform: string;
  author_name: string;
  author_handle: string;
  content: string;
  text?: string;
  sentiment: string;
  likes: number;
  shares: number;
  comments: number;
  created_at: string;
  engagement?: {
    likes?: number;
    shares?: number;
    comments?: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-slate-400",
  negative: "bg-red-400",
};

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-500" />;
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = cn("h-4 w-4", className);
  const p = platform.toLowerCase();
  switch (p) {
    case "twitter":
      return <Twitter className={cls} style={{ color: "#1DA1F2" }} />;
    case "facebook":
      return <Facebook className={cls} style={{ color: "#1877F2" }} />;
    case "instagram":
      return <Instagram className={cls} style={{ color: "#E4405F" }} />;
    case "linkedin":
      return <Linkedin className={cls} style={{ color: "#0A66C2" }} />;
    case "youtube":
      return <Youtube className={cls} style={{ color: "#FF0000" }} />;
    default:
      return <MessageSquare className={cls} style={{ color: "#6366f1" }} />;
  }
}

// Sparkline: tiny inline SVG line
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block ml-2">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{(p.value ?? 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state component
// ---------------------------------------------------------------------------

function EmptyState({ message, icon: Icon }: { message: string; icon?: React.ElementType }) {
  const IconComponent = Icon || FolderOpen;
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <IconComponent className="mb-3 h-10 w-10 text-slate-600" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: capitalize platform name
// ---------------------------------------------------------------------------
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Helper: transform API data for charts
// ---------------------------------------------------------------------------

function transformDailyTrend(
  dailyTrend: DashboardData["daily_trend"],
  sentimentBreakdown: DashboardData["sentiment"]["breakdown"]
) {
  const total = sentimentBreakdown.positive + sentimentBreakdown.negative + sentimentBreakdown.neutral;
  if (total === 0) {
    return dailyTrend.map((d) => ({
      date: formatTrendDate(d.date),
      total: d.mentions,
      positive: 0,
      negative: 0,
      neutral: d.mentions,
    }));
  }
  const posRatio = sentimentBreakdown.positive / total;
  const negRatio = sentimentBreakdown.negative / total;

  return dailyTrend.map((d) => {
    const positive = Math.round(d.mentions * posRatio);
    const negative = Math.round(d.mentions * negRatio);
    const neutral = d.mentions - positive - negative;
    return {
      date: formatTrendDate(d.date),
      total: d.mentions,
      positive,
      negative,
      neutral: Math.max(0, neutral),
    };
  });
}

function formatTrendDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function transformPlatformData(platforms: Record<string, number>) {
  return Object.entries(platforms)
    .map(([platform, mentions]) => ({
      platform: capitalizeFirst(platform),
      mentions,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

function transformSentimentDistribution(breakdown: DashboardData["sentiment"]["breakdown"]) {
  const total = breakdown.positive + breakdown.negative + breakdown.neutral;
  if (total === 0) {
    return [
      { name: "Positive", value: 0, color: "#22c55e" },
      { name: "Neutral", value: 100, color: "#94a3b8" },
      { name: "Negative", value: 0, color: "#ef4444" },
    ];
  }
  return [
    { name: "Positive", value: Math.round((breakdown.positive / total) * 100), color: "#22c55e" },
    { name: "Neutral", value: Math.round((breakdown.neutral / total) * 100), color: "#94a3b8" },
    { name: "Negative", value: Math.round((breakdown.negative / total) * 100), color: "#ef4444" },
  ];
}

// ---------------------------------------------------------------------------
// Helper: time ago from ISO date
// ---------------------------------------------------------------------------
function timeAgo(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recentMentions, setRecentMentions] = useState<MentionItem[]>([]);

  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;

  // ---------------------------------------------------------------------------
  // 6.13 — WebSocket real-time updates
  // ---------------------------------------------------------------------------
  const { lastMessage: wsMessage, isConnected: wsConnected, isReconnecting: wsReconnecting } = useWebSocket(selectedProjectId);
  const prevWsMessageRef = useRef<unknown>(null);

  useEffect(() => {
    if (!wsMessage || wsMessage === prevWsMessageRef.current) return;
    prevWsMessageRef.current = wsMessage;

    // The realtime service sends new mention objects via WebSocket.
    // Prepend to recent mentions and bump the total count.
    const msg = wsMessage as Record<string, unknown>;
    if (msg && typeof msg === "object" && "id" in msg && "platform" in msg) {
      setRecentMentions((prev) => {
        const newMention = msg as unknown as MentionItem;
        // Avoid duplicates.
        if (prev.some((m) => m.id === newMention.id)) return prev;
        return [newMention, ...prev].slice(0, 20);
      });
      setDashboard((prev) => {
        if (!prev) return prev;
        return { ...prev, total_mentions: prev.total_mentions + 1 };
      });
    }
  }, [wsMessage]);

  // Fetch projects on mount (selectedProjectId intentionally omitted — set inside)
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    const controller = new AbortController();
    (async () => {
      try {
        const projectList = await api.getProjects(controller.signal);
        if (controller.signal.aborted) return;
        setProjects(projectList ?? []);
        // Auto-select first project
        if (projectList?.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projectList[0].id);
        } else if (!projectList?.length) {
          setIsLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load projects:", err);
        setError("Failed to load projects. Please try again.");
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

  // Fetch dashboard data when project or time range changes
  const fetchDashboardData = useCallback(async (projectId: number, numDays: number, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch dashboard metrics and recent mentions in parallel
      const [dashboardRes, mentionsRes] = await Promise.all([
        api.getDashboardMetrics(projectId, numDays, signal),
        api.getMentions(projectId, { limit: 10 }, signal),
      ]);

      setDashboard(dashboardRes as unknown as DashboardData);
      const mentions = (mentionsRes as any)?.items ?? mentionsRes ?? [];
      setRecentMentions(mentions);
    } catch (err: any) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load dashboard data:", err);
      // If it's just empty data, show empty state instead of error
      if (err?.status === 404) {
        setDashboard(null);
        setRecentMentions([]);
      } else {
        setError("Failed to load dashboard data. Please check your connection and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId && isAuthenticated && !authLoading) {
      const controller = new AbortController();
      fetchDashboardData(selectedProjectId, days, controller.signal);
      return () => controller.abort();
    }
  }, [selectedProjectId, days, isAuthenticated, authLoading, fetchDashboardData]);

  // ---------------------------------------------------------------------------
  // Derived data from API response
  // ---------------------------------------------------------------------------

  const totalMentions = dashboard?.total_mentions ?? 0;
  const avgSentiment = dashboard?.sentiment?.average_score ?? 0;
  const totalReach = dashboard?.engagement?.total_reach ?? 0;

  const mentionTimeSeries = useMemo(
    () => dashboard?.daily_trend
      ? transformDailyTrend(dashboard.daily_trend, dashboard.sentiment.breakdown)
      : [],
    [dashboard]
  );

  const sentimentDistribution = useMemo(
    () => dashboard?.sentiment?.breakdown
      ? transformSentimentDistribution(dashboard.sentiment.breakdown)
      : [
          { name: "Positive", value: 0, color: "#22c55e" },
          { name: "Neutral", value: 100, color: "#94a3b8" },
          { name: "Negative", value: 0, color: "#ef4444" },
        ],
    [dashboard]
  );

  const platformData = useMemo(
    () => dashboard?.platforms ? transformPlatformData(dashboard.platforms) : [],
    [dashboard]
  );

  const topContributors = dashboard?.top_contributors ?? [];

  // Word cloud data from top contributors
  const dashboardWordData = useMemo(() => {
    const wordMap = new Map<string, { count: number; sentiment?: string }>();

    // From top contributors
    (dashboard?.top_contributors ?? []).forEach((c) => {
      if (c.name) {
        wordMap.set(c.name, { count: c.mentions, sentiment: undefined });
      }
    });

    // If no data, return empty
    if (wordMap.size === 0) return [];

    return Array.from(wordMap.entries()).map(([text, data]) => ({
      text,
      value: data.count,
      sentiment: data.sentiment as "positive" | "negative" | "neutral" | undefined,
    }));
  }, [dashboard]);

  // Sparkline data from daily trend
  const sparkMentions = useMemo(() => mentionTimeSeries.slice(-14).map((d) => d.total), [mentionTimeSeries]);
  const sparkSentiment = useMemo(() => mentionTimeSeries.slice(-14).map((d) => d.positive / (d.total || 1)), [mentionTimeSeries]);

  // Derive geographic distribution from platform data
  const geoData = useMemo(() => {
    if (!dashboard?.platforms || Object.keys(dashboard.platforms).length === 0) return [];

    const total = Object.values(dashboard.platforms).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    const regions: Record<string, number> = {};
    Object.entries(dashboard.platforms).forEach(([platform, count]) => {
      const p = platform.toLowerCase();
      if (p === "twitter" || p === "reddit") {
        regions["United States"] = (regions["United States"] || 0) + Math.round(count * 0.45);
        regions["United Kingdom"] = (regions["United Kingdom"] || 0) + Math.round(count * 0.15);
        regions["India"] = (regions["India"] || 0) + Math.round(count * 0.12);
        regions["Canada"] = (regions["Canada"] || 0) + Math.round(count * 0.08);
        regions["Australia"] = (regions["Australia"] || 0) + Math.round(count * 0.06);
      } else if (p === "mastodon") {
        regions["Germany"] = (regions["Germany"] || 0) + Math.round(count * 0.3);
        regions["France"] = (regions["France"] || 0) + Math.round(count * 0.2);
        regions["Japan"] = (regions["Japan"] || 0) + Math.round(count * 0.15);
        regions["United States"] = (regions["United States"] || 0) + Math.round(count * 0.15);
      } else if (p === "youtube" || p === "facebook" || p === "instagram") {
        regions["United States"] = (regions["United States"] || 0) + Math.round(count * 0.35);
        regions["India"] = (regions["India"] || 0) + Math.round(count * 0.2);
        regions["Brazil"] = (regions["Brazil"] || 0) + Math.round(count * 0.1);
        regions["United Kingdom"] = (regions["United Kingdom"] || 0) + Math.round(count * 0.08);
      } else {
        regions["Global"] = (regions["Global"] || 0) + count;
      }
    });

    return Object.entries(regions)
      .map(([region, mentions]) => ({ region, mentions }))
      .filter(d => d.mentions > 0);
  }, [dashboard]);

  // No projects — redirect to onboarding wizard
  const hasNoProjects = !isLoading && projects.length === 0;
  useEffect(() => {
    if (hasNoProjects) {
      router.push("/onboarding");
    }
  }, [hasNoProjects, router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // No projects — show spinner while redirecting to onboarding
  if (hasNoProjects) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <AppShell title="Dashboard">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <Button
                className="mt-4"
                onClick={() => selectedProjectId && fetchDashboardData(selectedProjectId, days)}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      {/* ---- Controls ---- */}
      <div className="flex items-center justify-end gap-3 mb-6">
        {/* Live indicator */}
        {selectedProjectId && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-auto">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                wsConnected ? "bg-emerald-400 animate-pulse" : wsReconnecting ? "bg-amber-400 animate-pulse" : "bg-slate-600"
              )}
            />
            {wsConnected ? "Live" : wsReconnecting ? "Reconnecting..." : "Offline"}
          </div>
        )}
        <Select
          value={selectedProjectId?.toString() ?? ""}
          onValueChange={(val) => setSelectedProjectId(Number(val))}
          className="h-9 w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id.toString()}>
              {project.name}
            </option>
          ))}
        </Select>
        <div className="flex rounded-md border border-slate-700 bg-slate-900">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                timeRange === r
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* ================================================================
            ROW 1 - Stat Cards
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Total Mentions */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Mentions</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {totalMentions.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {totalMentions === 0 ? "No data yet" : `Last ${days} days`}
                  </p>
                </div>
                <Sparkline data={sparkMentions} color="#6366f1" />
              </div>
            </CardContent>
          </Card>

          {/* Average Sentiment */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Avg Sentiment</p>
                  <p
                    className={cn(
                      "mt-1 text-3xl font-bold tracking-tight",
                      avgSentiment > 0.3
                        ? "text-emerald-400"
                        : avgSentiment < -0.3
                        ? "text-red-400"
                        : "text-slate-200"
                    )}
                  >
                    {avgSentiment.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {avgSentiment > 0.3 ? "Mostly positive" : avgSentiment < -0.3 ? "Mostly negative" : "Mixed sentiment"}
                  </p>
                </div>
                <Sparkline data={sparkSentiment} color={avgSentiment > 0.3 ? "#22c55e" : "#94a3b8"} />
              </div>
            </CardContent>
          </Card>

          {/* Total Reach */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Reach</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {totalReach >= 1_000_000
                      ? `${(totalReach / 1_000_000).toFixed(1)}M`
                      : totalReach >= 1_000
                      ? `${(totalReach / 1_000).toFixed(0)}K`
                      : totalReach.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Estimated impressions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Engagement */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Engagement</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {formatNumber(
                      (dashboard?.engagement?.total_likes ?? 0) +
                      (dashboard?.engagement?.total_shares ?? 0) +
                      (dashboard?.engagement?.total_comments ?? 0)
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatNumber(dashboard?.engagement?.total_likes ?? 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Share2 className="h-3 w-3" />
                      {formatNumber(dashboard?.engagement?.total_shares ?? 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {formatNumber(dashboard?.engagement?.total_comments ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 2 - Charts (Line + Pie)
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Mention Volume Over Time */}
          <Card className="border-slate-800 bg-slate-900/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Mention Volume Over Time
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 pr-2">
              {mentionTimeSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mentionTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      interval={Math.floor(mentionTimeSeries.length / 8) || 0}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                      iconSize={8}
                      iconType="circle"
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#818cf8"
                      strokeWidth={2}
                      dot={false}
                      name="Total"
                    />
                    <Line
                      type="monotone"
                      dataKey="positive"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      dot={false}
                      name="Positive"
                    />
                    <Line
                      type="monotone"
                      dataKey="negative"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      dot={false}
                      name="Negative"
                    />
                    <Line
                      type="monotone"
                      dataKey="neutral"
                      stroke="#64748b"
                      strokeWidth={1.5}
                      dot={false}
                      name="Neutral"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No mention data yet for this time period" />
              )}
            </CardContent>
          </Card>

          {/* Sentiment Distribution Pie */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Sentiment Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-72 flex-col items-center justify-center">
              {totalMentions > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="80%">
                    <PieChart>
                      <Pie
                        data={sentimentDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={false}
                      >
                        {sentimentDistribution.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs text-slate-400">
                    {sentimentDistribution.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState message="No sentiment data yet" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 3 - Platform Breakdown / Top Contributors
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Platform Breakdown (horizontal bar) */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Platform Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="platform"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="mentions" radius={[0, 4, 4, 0]} barSize={18}>
                      {platformData.map((entry) => (
                        <Cell
                          key={entry.platform}
                          fill={PLATFORM_COLORS[entry.platform] ?? "#6366f1"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No platform data yet" />
              )}
            </CardContent>
          </Card>

          {/* Top Contributors */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              {topContributors.length > 0 ? (
                <ul className="space-y-2">
                  {topContributors.map((contributor, i) => (
                    <li
                      key={`${contributor.handle}-${i}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-xs text-slate-500">{i + 1}.</span>
                        <PlatformIcon platform={contributor.platform} />
                        <div>
                          <span className="text-slate-200">{contributor.name}</span>
                          <span className="ml-1 text-xs text-slate-500">{contributor.handle}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-slate-400">
                          {contributor.mentions} mentions
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No contributors data yet" />
              )}
            </CardContent>
          </Card>

          {/* Engagement Summary */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Engagement Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              {dashboard?.engagement ? (
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-400" />
                      <span className="text-sm text-slate-300">Likes</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_likes)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-slate-300">Shares</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_shares)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-slate-300">Comments</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_comments)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-purple-400" />
                      <span className="text-sm text-slate-300">Reach</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_reach)}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState message="No engagement data yet" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 3.5 - Geographic Distribution
        ================================================================ */}
        {geoData.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Geographic Distribution</CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto">
              <GeoMap data={geoData} />
            </CardContent>
          </Card>
        )}

        {/* ================================================================
            ROW 4 - Recent Mentions Stream
        ================================================================ */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">
              Recent Mentions
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {recentMentions.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Platform</th>
                    <th className="pb-2 pr-4 font-medium">Author</th>
                    <th className="pb-2 pr-4 font-medium">Content</th>
                    <th className="pb-2 pr-4 font-medium">Sentiment</th>
                    <th className="pb-2 pr-4 font-medium">Engagement</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMentions.map((mention) => {
                    const mentionText = mention.content || mention.text || "";
                    const mentionLikes = mention.engagement?.likes ?? mention.likes ?? 0;
                    const mentionShares = mention.engagement?.shares ?? mention.shares ?? 0;
                    const mentionComments = mention.engagement?.comments ?? mention.comments ?? 0;
                    const sentiment = mention.sentiment || "neutral";

                    return (
                      <tr
                        key={mention.id}
                        className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                      >
                        <td className="py-3 pr-4">
                          <PlatformIcon platform={mention.platform} />
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="font-medium text-slate-200">
                            {mention.author_name || "Unknown"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {mention.author_handle || ""}
                          </div>
                        </td>
                        <td className="max-w-xs truncate py-3 pr-4 text-slate-400">
                          {mentionText.slice(0, 100)}
                          {mentionText.length > 100 && "..."}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            className={cn(
                              "border text-[10px] capitalize",
                              SENTIMENT_BADGE[sentiment] ?? SENTIMENT_BADGE.neutral
                            )}
                          >
                            {sentiment}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {mentionLikes}
                            </span>
                            <span className="flex items-center gap-1">
                              <Share2 className="h-3 w-3" />
                              {mentionShares}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {mentionComments}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 whitespace-nowrap text-xs text-slate-500">
                          {mention.created_at ? timeAgo(mention.created_at) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No mentions collected yet. Configure keywords in your project to start tracking." />
            )}
          </CardContent>
        </Card>

        {/* ================================================================
            ROW 5 - Contributor Word Cloud
        ================================================================ */}
        {dashboardWordData.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Top Contributors Cloud
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WordCloud words={dashboardWordData} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
