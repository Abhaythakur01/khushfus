"use client";

import React from "react";
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
import { formatNumber } from "@/lib/utils";
import { ChartTooltip, EmptyState } from "./ChartHelpers";
import { DashboardMetrics, COLORS, PIE_COLORS } from "./analyticsTypes";

export default function SentimentTab({ metrics }: { metrics: DashboardMetrics }) {
  const sentimentPieData = [
    { name: "Positive", value: metrics.sentiment_breakdown.positive || 0 },
    { name: "Neutral", value: metrics.sentiment_breakdown.neutral || 0 },
    { name: "Negative", value: metrics.sentiment_breakdown.negative || 0 },
  ].filter((d) => d.value > 0);

  const total = sentimentPieData.reduce((a, b) => a + b.value, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Sentiment summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-slate-400">Positive</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatNumber(metrics.sentiment_breakdown.positive || 0)}</p>
          <p className="text-xs text-slate-500">{((metrics.sentiment_breakdown.positive || 0) / total * 100).toFixed(1)}% of total</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-3 rounded-full bg-slate-500" />
            <span className="text-sm text-slate-400">Neutral</span>
          </div>
          <p className="text-2xl font-bold text-slate-300">{formatNumber(metrics.sentiment_breakdown.neutral || 0)}</p>
          <p className="text-xs text-slate-500">{((metrics.sentiment_breakdown.neutral || 0) / total * 100).toFixed(1)}% of total</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-slate-400">Negative</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{formatNumber(metrics.sentiment_breakdown.negative || 0)}</p>
          <p className="text-xs text-slate-500">{((metrics.sentiment_breakdown.negative || 0) / total * 100).toFixed(1)}% of total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sentiment over time */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Sentiment Over Time</h3>
          {metrics.sentiment_over_time.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={metrics.sentiment_over_time}>
                <defs>
                  <linearGradient id="posFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.positive} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.positive} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.negative} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.negative} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(value: string) => <span className="text-xs text-slate-400">{value}</span>} />
                <Area type="monotone" dataKey="positive" name="Positive" stroke={COLORS.positive} fill="url(#posFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="neutral" name="Neutral" stroke={COLORS.neutral} fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="negative" name="Negative" stroke={COLORS.negative} fill="url(#negFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No sentiment trend data for this period" />
          )}
        </div>

        {/* Pie chart */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Sentiment Distribution</h3>
          {sentimentPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sentimentPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {sentimentPieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No sentiment data available" />
          )}
        </div>
      </div>
    </div>
  );
}
