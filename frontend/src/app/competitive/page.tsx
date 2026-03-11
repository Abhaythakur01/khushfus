"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Users,
  MessageSquare,
  Eye,
  Inbox,
  PieChart,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { api, DashboardMetrics, Project } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_COLORS = ["#818cf8", "#f472b6", "#34d399", "#fbbf24", "#f87171"];

const TIME_RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectSummary {
  id: number;
  name: string;
}

interface CompetitorData {
  project: ProjectSummary;
  metrics: DashboardMetrics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTrend(
  raw: Record<string, number>[] | undefined
): { date: string; count: number }[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((entry) => {
    const date =
      (entry.date as unknown as string) ??
      (entry.day as unknown as string) ??
      "";
    const count =
      entry.count ?? entry.mentions ?? entry.total ?? Object.values(entry).find((v) => typeof v === "number") ?? 0;
    return { date: String(date), count: Number(count) };
  });
}

function getSentimentBreakdown(m: DashboardMetrics): {
  positive: number;
  neutral: number;
  negative: number;
} {
  const sb = m.sentiment_breakdown ?? m.sentiment ?? {};
  return {
    positive: Number(sb.positive ?? 0),
    neutral: Number(sb.neutral ?? 0),
    negative: Number(sb.negative ?? 0),
  };
}

function getPlatformBreakdown(m: DashboardMetrics): Record<string, number> {
  return m.platform_breakdown ?? m.platforms ?? {};
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-slate-200">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
            style={{ backgroundColor: p.color }}
          />
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          <p className="text-xl font-bold text-slate-100 truncate">{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Inbox className="h-12 w-12 text-slate-700 mb-3" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CompetitiveIntelligencePage() {
  // State
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [days, setDays] = useState(30);
  const [competitorData, setCompetitorData] = useState<CompetitorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getProjects();
        if (cancelled) return;
        const list = (data || []).map((p: Project) => ({
          id: p.id,
          name: p.name,
        }));
        setProjects(list);
        // Pre-select first project (up to 3)
        if (list.length > 0) {
          setSelectedIds(list.slice(0, Math.min(3, list.length)).map((p) => p.id));
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle project selection (max 5)
  const toggleProject = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        if (prev.includes(id)) {
          return prev.filter((x) => x !== id);
        }
        if (prev.length >= 5) return prev;
        return [...prev, id];
      });
    },
    []
  );

  // Fetch metrics for all selected projects in parallel
  const fetchCompetitorData = useCallback(async () => {
    if (selectedIds.length === 0) {
      setCompetitorData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        selectedIds.map(async (id) => {
          const metrics = await api.getDashboardMetrics(id, days);
          const proj = projects.find((p) => p.id === id);
          return {
            project: proj || { id, name: `Project ${id}` },
            metrics,
          } as CompetitorData;
        })
      );

      const fulfilled = results
        .filter(
          (r): r is PromiseFulfilledResult<CompetitorData> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);

      setCompetitorData(fulfilled);

      if (fulfilled.length === 0) {
        setError("Failed to load metrics for all selected projects.");
      }
    } catch (err: unknown) {
      console.error("Failed to load competitor data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load competitive data"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedIds, days, projects]);

  useEffect(() => {
    if (projects.length > 0 && selectedIds.length > 0) {
      fetchCompetitorData();
    }
  }, [fetchCompetitorData, projects.length, selectedIds.length]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const totalMentionsAll = useMemo(
    () => competitorData.reduce((sum, d) => sum + (d.metrics.total_mentions ?? 0), 0),
    [competitorData]
  );

  const avgSentimentAll = useMemo(() => {
    if (competitorData.length === 0) return 0;
    const total = competitorData.reduce(
      (sum, d) => sum + (d.metrics.avg_sentiment ?? 0),
      0
    );
    return total / competitorData.length;
  }, [competitorData]);

  const totalReachAll = useMemo(
    () => competitorData.reduce((sum, d) => sum + (d.metrics.total_reach ?? 0), 0),
    [competitorData]
  );

  const primarySov = useMemo(() => {
    if (competitorData.length === 0 || totalMentionsAll === 0) return 0;
    const primary = competitorData[0];
    return ((primary?.metrics.total_mentions ?? 0) / totalMentionsAll) * 100;
  }, [competitorData, totalMentionsAll]);

  // Share of Voice bar data
  const sovData = useMemo(() => {
    if (totalMentionsAll === 0) return [];
    return competitorData.map((d, i) => ({
      name: d.project.name,
      mentions: d.metrics.total_mentions ?? 0,
      percentage: (((d.metrics.total_mentions ?? 0) / totalMentionsAll) * 100).toFixed(1),
      fill: PROJECT_COLORS[i % PROJECT_COLORS.length],
    }));
  }, [competitorData, totalMentionsAll]);

  // Sentiment comparison data
  const sentimentComparisonData = useMemo(() => {
    return competitorData.map((d, i) => {
      const sb = getSentimentBreakdown(d.metrics);
      return {
        name: d.project.name,
        positive: sb.positive,
        neutral: sb.neutral,
        negative: sb.negative,
        fill: PROJECT_COLORS[i % PROJECT_COLORS.length],
      };
    });
  }, [competitorData]);

  // Trend comparison: merge all project trends by date
  const trendData = useMemo(() => {
    if (competitorData.length === 0) return [];

    // Collect all dates across projects
    const dateMap = new Map<string, Record<string, number>>();

    competitorData.forEach((d) => {
      const trend = normalizeTrend(
        d.metrics.trend ?? d.metrics.daily_trend ?? d.metrics.mentions_over_time as Record<string, number>[] | undefined
      );
      trend.forEach((entry) => {
        if (!dateMap.has(entry.date)) {
          dateMap.set(entry.date, {});
        }
        const row = dateMap.get(entry.date)!;
        row[d.project.name] = entry.count;
      });
    });

    // Sort by date and return
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        ...values,
      }));
  }, [competitorData]);

  // Platform comparison data
  const platformComparisonData = useMemo(() => {
    if (competitorData.length === 0) return [];

    // Collect all platforms
    const allPlatforms = new Set<string>();
    competitorData.forEach((d) => {
      Object.keys(getPlatformBreakdown(d.metrics)).forEach((p) =>
        allPlatforms.add(p)
      );
    });

    return Array.from(allPlatforms).map((platform) => {
      const row: Record<string, string | number> = { platform };
      competitorData.forEach((d) => {
        row[d.project.name] = getPlatformBreakdown(d.metrics)[platform] ?? 0;
      });
      return row;
    });
  }, [competitorData]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell title="Competitive Intelligence">
      {/* Controls */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        {/* Project selector */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-2 font-medium">
            Compare projects (select up to 5)
          </p>
          <div className="flex flex-wrap gap-2">
            {projectsLoading ? (
              <span className="text-sm text-slate-500">
                Loading projects...
              </span>
            ) : projects.length === 0 ? (
              <span className="text-sm text-slate-500">No projects found</span>
            ) : (
              projects.map((p, i) => {
                const isSelected = selectedIds.includes(p.id);
                const colorIdx = isSelected
                  ? selectedIds.indexOf(p.id)
                  : i;
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                      isSelected
                        ? "text-white border-transparent"
                        : "text-slate-400 border-slate-700 bg-slate-800/50 hover:text-slate-200 hover:border-slate-600"
                    )}
                    style={
                      isSelected
                        ? {
                            backgroundColor:
                              PROJECT_COLORS[
                                selectedIds.indexOf(p.id) %
                                  PROJECT_COLORS.length
                              ] + "30",
                            borderColor:
                              PROJECT_COLORS[
                                selectedIds.indexOf(p.id) %
                                  PROJECT_COLORS.length
                              ],
                            color:
                              PROJECT_COLORS[
                                selectedIds.indexOf(p.id) %
                                  PROJECT_COLORS.length
                              ],
                          }
                        : undefined
                    }
                  >
                    {p.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Time range */}
        <div>
          <p className="text-xs text-slate-400 mb-2 font-medium">Time range</p>
          <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  days === r.value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : selectedIds.length === 0 ? (
        <EmptyState message="Select at least one project to view competitive intelligence" />
      ) : competitorData.length === 0 ? (
        <EmptyState message="No data available for the selected projects" />
      ) : (
        <>
          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="Total Mentions"
              value={formatNumber(totalMentionsAll)}
              subtitle={`Across ${competitorData.length} project${competitorData.length !== 1 ? "s" : ""}`}
            />
            <KpiCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Avg. Sentiment"
              value={avgSentimentAll.toFixed(2)}
              subtitle="Across all compared"
            />
            <KpiCard
              icon={<Eye className="h-5 w-5" />}
              label="Total Reach"
              value={formatNumber(totalReachAll)}
              subtitle="Combined reach"
            />
            <KpiCard
              icon={<PieChart className="h-5 w-5" />}
              label="Primary Share of Voice"
              value={`${primarySov.toFixed(1)}%`}
              subtitle={competitorData[0]?.project.name ?? ""}
            />
          </div>

          {/* Row 2: Share of Voice + Sentiment Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Share of Voice */}
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="border-slate-800">
                <CardTitle className="text-slate-100 text-sm font-semibold">
                  Share of Voice
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sovData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={sovData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#475569" }}
                        tickLine={{ stroke: "#475569" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#475569" }}
                        tickLine={{ stroke: "#475569" }}
                        width={100}
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                      />
                      <Bar dataKey="mentions" radius={[0, 4, 4, 0]} barSize={28}>
                        {sovData.map((entry, idx) => (
                          <Cell
                            key={`sov-${idx}`}
                            fill={
                              PROJECT_COLORS[idx % PROJECT_COLORS.length]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="No mention data" />
                )}
                {/* Percentage labels */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {sovData.map((entry, idx) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            PROJECT_COLORS[idx % PROJECT_COLORS.length],
                        }}
                      />
                      <span className="text-slate-300">{entry.name}</span>
                      <span className="text-slate-500">{entry.percentage}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sentiment Comparison */}
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="border-slate-800">
                <CardTitle className="text-slate-100 text-sm font-semibold">
                  Sentiment Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sentimentComparisonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={sentimentComparisonData}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#475569" }}
                        tickLine={{ stroke: "#475569" }}
                      />
                      <YAxis
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#475569" }}
                        tickLine={{ stroke: "#475569" }}
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                      />
                      <Bar
                        dataKey="positive"
                        fill="#34d399"
                        radius={[4, 4, 0, 0]}
                        barSize={20}
                      />
                      <Bar
                        dataKey="neutral"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                        barSize={20}
                      />
                      <Bar
                        dataKey="negative"
                        fill="#f87171"
                        radius={[4, 4, 0, 0]}
                        barSize={20}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="No sentiment data" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Trend Comparison (full width) */}
          <Card className="bg-slate-900/60 border-slate-800 mb-6">
            <CardHeader className="border-slate-800">
              <CardTitle className="text-slate-100 text-sm font-semibold">
                Mention Trend Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={trendData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#475569" }}
                      tickLine={{ stroke: "#475569" }}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#475569" }}
                      tickLine={{ stroke: "#475569" }}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ stroke: "#475569" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {competitorData.map((d, idx) => (
                      <Line
                        key={d.project.id}
                        type="monotone"
                        dataKey={d.project.name}
                        stroke={
                          PROJECT_COLORS[idx % PROJECT_COLORS.length]
                        }
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No trend data available" />
              )}
            </CardContent>
          </Card>

          {/* Row 4: Platform Comparison */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="border-slate-800">
              <CardTitle className="text-slate-100 text-sm font-semibold">
                Platform Breakdown Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              {platformComparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={platformComparisonData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="platform"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#475569" }}
                      tickLine={{ stroke: "#475569" }}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#475569" }}
                      tickLine={{ stroke: "#475569" }}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {competitorData.map((d, idx) => (
                      <Bar
                        key={d.project.id}
                        dataKey={d.project.name}
                        fill={
                          PROJECT_COLORS[idx % PROJECT_COLORS.length]
                        }
                        radius={[4, 4, 0, 0]}
                        barSize={24}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No platform data available" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
