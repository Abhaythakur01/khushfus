"use client";

/**
 * WidgetCharts — Recharts-based chart renderers for the custom dashboard viewer.
 * Loaded dynamically to keep the initial JS bundle lean.
 */

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import type { WidgetType, ChartVariant } from "./page";

// ---------------------------------------------------------------------------
// Shared tooltip style
// ---------------------------------------------------------------------------

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#0f1623",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WidgetChartsProps {
  type: WidgetType;
  variant: ChartVariant;
  metrics: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helper: extract chart data from metrics
// ---------------------------------------------------------------------------

function getMentionTrendData(metrics: Record<string, unknown>) {
  const trend = (metrics.daily_trend ?? metrics.trend ?? []) as Array<
    Record<string, unknown>
  >;
  return trend.map((row) => ({
    date: String(row.date ?? row.day ?? "").slice(5), // MM-DD
    mentions: Number(row.total ?? row.count ?? row.mentions ?? 0),
    positive: Number(row.positive ?? 0),
    negative: Number(row.negative ?? 0),
    neutral: Number(row.neutral ?? 0),
  }));
}

function getSentimentData(metrics: Record<string, unknown>) {
  const breakdown =
    (metrics.sentiment as Record<string, unknown>)?.breakdown ??
    metrics.sentiment_breakdown;
  if (!breakdown || typeof breakdown !== "object") {
    return [
      { name: "Positive", value: 0, color: "#22c55e" },
      { name: "Neutral", value: 100, color: "#94a3b8" },
      { name: "Negative", value: 0, color: "#ef4444" },
    ];
  }
  const b = breakdown as Record<string, number>;
  return [
    { name: "Positive", value: b.positive ?? 0, color: "#22c55e" },
    { name: "Neutral", value: b.neutral ?? 0, color: "#94a3b8" },
    { name: "Negative", value: b.negative ?? 0, color: "#ef4444" },
  ];
}

function getPlatformData(metrics: Record<string, unknown>) {
  const platforms = metrics.platforms ?? metrics.platform_breakdown;
  if (!platforms || typeof platforms !== "object") return [];
  return Object.entries(platforms as Record<string, number>)
    .map(([platform, mentions]) => ({ platform, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8);
}

const PLATFORM_BAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function WidgetCharts({ type, variant, metrics }: WidgetChartsProps) {
  if (type === "line_chart") {
    return <LineChartWidget variant={variant} metrics={metrics} />;
  }
  if (type === "pie_chart") {
    return <PieChartWidget variant={variant} metrics={metrics} />;
  }
  if (type === "bar_chart") {
    return <BarChartWidget variant={variant} metrics={metrics} />;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

function LineChartWidget({
  variant,
  metrics,
}: {
  variant: ChartVariant;
  metrics: Record<string, unknown>;
}) {
  const data = getMentionTrendData(metrics);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-500">
        No trend data
      </div>
    );
  }

  if (variant === "sentiment_breakdown") {
    return (
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="positive" stroke="#22c55e" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="neutral" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="negative" stroke="#ef4444" dot={false} strokeWidth={1.5} />
          <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // mention_trend or platform_breakdown (fallback to mentions line)
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="mentions" stroke="#6366f1" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Pie chart
// ---------------------------------------------------------------------------

function PieChartWidget({
  variant,
  metrics,
}: {
  variant: ChartVariant;
  metrics: Record<string, unknown>;
}) {
  const data =
    variant === "platform_breakdown"
      ? getPlatformData(metrics).map((d, i) => ({
          name: d.platform,
          value: d.mentions,
          color: PLATFORM_BAR_COLORS[i % PLATFORM_BAR_COLORS.length],
        }))
      : getSentimentData(metrics);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (!total) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-500">
        No data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={55}
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-400 capitalize">{entry.name}</span>
            </div>
            <span className="text-slate-300 tabular-nums font-medium">
              {total > 0 ? `${Math.round((entry.value / total) * 100)}%` : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

function BarChartWidget({
  variant,
  metrics,
}: {
  variant: ChartVariant;
  metrics: Record<string, unknown>;
}) {
  let data: Array<{ name: string; value: number; color: string }> = [];

  if (variant === "sentiment_breakdown") {
    data = getSentimentData(metrics).map((d) => ({
      name: d.name,
      value: d.value,
      color: d.color,
    }));
  } else if (variant === "platform_breakdown") {
    data = getPlatformData(metrics).map((d, i) => ({
      name: d.platform,
      value: d.mentions,
      color: PLATFORM_BAR_COLORS[i % PLATFORM_BAR_COLORS.length],
    }));
  } else {
    // mention_trend — use daily counts as a bar chart
    data = getMentionTrendData(metrics)
      .slice(-14)
      .map((d) => ({ name: d.date, value: d.mentions, color: "#6366f1" }));
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-500">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
