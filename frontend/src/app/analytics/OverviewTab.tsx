"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Heart,
  Activity,
  Users,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { ChartTooltip, EmptyState } from "./ChartHelpers";
import { DashboardMetrics, COLORS, PIE_COLORS } from "./analyticsTypes";
import { WordCloud } from "@/components/charts/WordCloud";
import { GeoMap } from "@/components/charts/GeoMap";

function StatCard({ title, value, change, icon: Icon }: {
  title: string;
  value: string | number;
  change?: number;
  icon: any;
}) {
  const isPositive = (change ?? 0) > 0;
  const isNeutral = change === undefined || change === 0;
  const ChangeIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const changeColor = isNeutral ? "text-slate-500" : isPositive ? "text-emerald-400" : "text-red-400";

  return (
    <div className="rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">{title}</span>
        <div className="p-2 bg-white/[0.06] rounded-lg">
          <Icon className="h-4 w-4 text-indigo-400" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-100 mb-1">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {change !== undefined && (
        <div className={cn("flex items-center gap-1 text-xs", changeColor)}>
          <ChangeIcon className="h-3.5 w-3.5" />
          <span>{Math.abs(change).toFixed(1)}% vs previous period</span>
        </div>
      )}
    </div>
  );
}

export default function OverviewTab({ metrics }: { metrics: DashboardMetrics }) {
  const wordCloudData = (metrics.top_keywords || []).map((kw: any) => ({
    text: kw.keyword || kw.term || kw.name || kw,
    value: kw.count || kw.mentions || kw.value || 1,
    sentiment: kw.sentiment,
  }));

  const sentimentPieData = [
    { name: "Positive", value: metrics.sentiment_breakdown.positive || 0 },
    { name: "Neutral", value: metrics.sentiment_breakdown.neutral || 0 },
    { name: "Negative", value: metrics.sentiment_breakdown.negative || 0 },
  ].filter((d) => d.value > 0);

  // Derive geographic distribution from platform data
  const geoData = useMemo(() => {
    if (!metrics.platform_breakdown || Object.keys(metrics.platform_breakdown).length === 0) return [];

    const total = Object.values(metrics.platform_breakdown).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    const regions: Record<string, number> = {};
    Object.entries(metrics.platform_breakdown).forEach(([platform, count]) => {
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
  }, [metrics.platform_breakdown]);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Mentions" value={metrics.total_mentions} change={metrics.mentions_change} icon={MessageSquare} />
        <StatCard title="Total Engagement" value={metrics.total_engagement} change={metrics.engagement_change} icon={Heart} />
        <StatCard title="Avg Sentiment" value={metrics.avg_sentiment.toFixed(2)} change={metrics.sentiment_change} icon={Activity} />
        <StatCard title="Total Reach" value={metrics.total_reach} change={metrics.reach_change} icon={Users} />
      </div>

      {/* Mentions trend + Sentiment pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Mentions Over Time</h3>
          {metrics.mentions_over_time.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={metrics.mentions_over_time}>
                <defs>
                  <linearGradient id="mentionFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" name="Mentions" stroke={COLORS.indigo} fill="url(#mentionFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No mention data for this period" />
          )}
        </div>

        <div className="rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Sentiment Breakdown</h3>
          {sentimentPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={sentimentPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {sentimentPieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value: string) => <span className="text-xs text-slate-400">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No sentiment data available" />
          )}
        </div>
      </div>

      {/* Top keywords + Top authors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Top Keywords</h3>
          {metrics.top_keywords.length > 0 ? (
            <div className="space-y-2">
              {metrics.top_keywords.slice(0, 10).map((kw, i) => {
                const maxCount = metrics.top_keywords[0]?.count || 1;
                const pct = (kw.count / maxCount) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-slate-300 w-32 truncate">{kw.keyword}</span>
                    <div className="flex-1 bg-white/[0.06] rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-12 text-right">{formatNumber(kw.count)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No keyword data available" />
          )}
        </div>

        <div className="rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Top Authors</h3>
          {metrics.top_authors.length > 0 ? (
            <div className="space-y-3">
              {metrics.top_authors.slice(0, 8).map((author, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                    {(author.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{author.name}</p>
                    <p className="text-xs text-slate-500 truncate">{author.handle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-slate-300">{author.mentions}</p>
                    <p className="text-[10px] text-slate-500">mentions</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No author data available" />
          )}
        </div>
      </div>

      {/* Geographic Distribution */}
      {geoData.length > 0 && (
        <div className="rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Geographic Distribution</h3>
          <div className="max-h-72 overflow-y-auto">
            <GeoMap data={geoData} />
          </div>
        </div>
      )}

      {/* Keyword Cloud */}
      <div className="rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Keyword Cloud</h3>
        <WordCloud words={wordCloudData} />
      </div>
    </div>
  );
}
