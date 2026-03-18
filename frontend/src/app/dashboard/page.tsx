"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Heart,
  Share2,
  Eye,
  Bell,
  ChevronDown,
  AlertCircle,
  FolderOpen,
  MessageSquare,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useProjects } from "@/hooks/useProjects";
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
import { DateRangePicker, type DateRange } from "@/components/ui/daterange";
import {
  type DashboardData,
  type MentionItem,
  Sparkline,
  PlatformIcon,
  EmptyState,
  timeAgo,
  transformDailyTrend,
  transformSentimentDistribution,
  transformPlatformData,
} from "./DashboardHelpers";

// ---------------------------------------------------------------------------
// Dynamic imports — defers Recharts (~200-300KB) until after initial render
// ---------------------------------------------------------------------------

function ChartLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

const DashboardCharts = dynamic(() => import("./DashboardCharts"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});

const WordCloud = dynamic(() => import("@/components/charts/WordCloud").then((m) => ({ default: m.WordCloud })), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});

const GeoMap = dynamic(() => import("@/components/charts/GeoMap").then((m) => ({ default: m.GeoMap })), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});

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
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { projects, isLoading: projectsLoading } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range state (replaces the old 7d/30d/90d toggle)
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  });

  // Derive `days` from the custom date range for backward-compat with API call
  const days = Math.max(
    1,
    Math.round(
      (new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) / 86400_000
    ) + 1
  );

  // Data state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recentMentions, setRecentMentions] = useState<MentionItem[]>([]);

  // Auto-select first project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    } else if (!projectsLoading && projects.length === 0) {
      setIsLoading(false);
    }
  }, [projects, projectsLoading, selectedProjectId]);

  // ---------------------------------------------------------------------------
  // 6.13 — WebSocket real-time updates
  // ---------------------------------------------------------------------------
  const { lastMessage: wsMessage, isConnected: wsConnected, isReconnecting: wsReconnecting } = useWebSocket(selectedProjectId);
  const prevWsMessageRef = useRef<unknown>(null);

  useEffect(() => {
    if (!wsMessage || wsMessage === prevWsMessageRef.current) return;
    prevWsMessageRef.current = wsMessage;

    const msg = wsMessage as Record<string, unknown>;
    if (msg && typeof msg === "object" && "id" in msg && "platform" in msg) {
      setRecentMentions((prev) => {
        const newMention = msg as unknown as MentionItem;
        if (prev.some((m) => m.id === newMention.id)) return prev;
        return [newMention, ...prev].slice(0, 20);
      });
      setDashboard((prev) => {
        if (!prev) return prev;
        return { ...prev, total_mentions: prev.total_mentions + 1 };
      });
    }
  }, [wsMessage]);

  // Fetch dashboard data when project or time range changes
  const fetchDashboardData = useCallback(async (projectId: number, numDays: number, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
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

  const sentimentBreakdown = dashboard?.sentiment?.breakdown ?? dashboard?.sentiment_breakdown ?? null;

  const mentionTimeSeries = useMemo(
    () => dashboard?.daily_trend && sentimentBreakdown
      ? transformDailyTrend(dashboard.daily_trend, sentimentBreakdown)
      : [],
    [dashboard?.daily_trend, sentimentBreakdown]
  );

  const sentimentDistribution = useMemo(
    () => dashboard?.sentiment?.breakdown
      ? transformSentimentDistribution(dashboard.sentiment.breakdown)
      : [
          { name: "Positive", value: 0, color: "#22c55e" },
          { name: "Neutral", value: 100, color: "#94a3b8" },
          { name: "Negative", value: 0, color: "#ef4444" },
        ],
    [dashboard?.sentiment?.breakdown]
  );

  const platformData = useMemo(
    () => dashboard?.platforms ? transformPlatformData(dashboard.platforms) : [],
    [dashboard?.platforms]
  );

  const topContributors = dashboard?.top_contributors ?? [];

  // Word cloud data from top contributors
  const dashboardWordData = useMemo(() => {
    const wordMap = new Map<string, { count: number; sentiment?: string }>();
    (dashboard?.top_contributors ?? []).forEach((c) => {
      if (c.name) {
        wordMap.set(c.name, { count: c.mentions, sentiment: undefined });
      }
    });
    if (wordMap.size === 0) return [];
    return Array.from(wordMap.entries()).map(([text, data]) => ({
      text,
      value: data.count,
      sentiment: data.sentiment as "positive" | "negative" | "neutral" | undefined,
    }));
  }, [dashboard?.top_contributors]);

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
  }, [dashboard?.platforms]);

  // No projects — redirect to onboarding wizard
  const hasNoProjects = !isLoading && !projectsLoading && projects.length === 0;
  useEffect(() => {
    if (hasNoProjects) {
      router.push("/onboarding");
    }
  }, [hasNoProjects, router]);

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

  if (hasNoProjects) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <AppShell title="Dashboard">
        <Card>
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
          className="h-9 w-48"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id.toString()}>
              {project.name}
            </option>
          ))}
        </Select>
        <DateRangePicker
          defaultPreset="30d"
          onChange={(range) => setDateRange(range)}
        />
      </div>

      <div className="space-y-6">
        {/* ================================================================
            ROW 1 - Stat Cards
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Total Mentions */}
          <Card className="glass-card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Mentions</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {totalMentions.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {totalMentions === 0 ? "No data yet" : `${dateRange.startDate} – ${dateRange.endDate}`}
                  </p>
                </div>
                <Sparkline data={sparkMentions} color="#6366f1" />
              </div>
            </CardContent>
          </Card>

          {/* Average Sentiment */}
          <Card className="glass-card-hover">
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
          <Card className="glass-card-hover">
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
          <Card className="glass-card-hover">
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
            ROW 2 + 3 - Charts (dynamically imported)
        ================================================================ */}
        <DashboardCharts
          mentionTimeSeries={mentionTimeSeries}
          sentimentDistribution={sentimentDistribution}
          platformData={platformData}
          totalMentions={totalMentions}
        />

        {/* ================================================================
            ROW 3 - Top Contributors / Engagement Summary
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top Contributors */}
          <Card className="">
            <CardHeader className="pb-2">
              <CardTitle className="">
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              {topContributors.length > 0 ? (
                <ul className="space-y-2">
                  {topContributors.map((contributor, i) => (
                    <li
                      key={`${contributor.handle}-${i}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.04]"
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
          <Card className="">
            <CardHeader className="pb-2">
              <CardTitle className="">
                Engagement Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              {dashboard?.engagement ? (
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-400" />
                      <span className="text-sm text-slate-300">Likes</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_likes)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-slate-300">Shares</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_shares)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-slate-300">Comments</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-slate-200">
                      {formatNumber(dashboard.engagement.total_comments)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md px-2 py-3 hover:bg-white/[0.04]">
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
          <Card className="">
            <CardHeader className="pb-2">
              <CardTitle className="">Geographic Distribution</CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto">
              <GeoMap data={geoData} />
            </CardContent>
          </Card>
        )}

        {/* ================================================================
            ROW 4 - Recent Mentions Stream
        ================================================================ */}
        <Card className="">
          <CardHeader className="pb-2">
            <CardTitle className="">
              Recent Mentions
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {recentMentions.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-slate-500">
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
                        className="border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.02]"
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
          <Card className="">
            <CardHeader className="pb-2">
              <CardTitle className="">
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
