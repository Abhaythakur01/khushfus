"use client";

import React from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import { ChartTooltip, EmptyState } from "./ChartHelpers";
import { DashboardMetrics, COLORS, PLATFORM_COLORS, PLATFORM_LABELS } from "./analyticsTypes";

export default function PlatformsTab({ metrics }: { metrics: DashboardMetrics }) {
  const platformData = Object.entries(metrics.platform_breakdown)
    .map(([platform, count]) => ({
      platform: PLATFORM_LABELS[platform] || platform,
      key: platform,
      count: count as number,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {platformData.length === 0 ? (
        <EmptyState message="No platform data available for this period" />
      ) : (
        <>
          {/* Bar chart */}
          <div className="rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Mentions by Platform</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={platformData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
                <YAxis dataKey="platform" type="category" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#334155" }} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Mentions" radius={[0, 6, 6, 0]}>
                  {platformData.map((entry) => (
                    <Cell key={entry.key} fill={PLATFORM_COLORS[entry.key] || COLORS.indigo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Platform cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {platformData.map((p) => {
              const totalMentions = metrics.total_mentions || 1;
              const pct = (p.count / totalMentions * 100).toFixed(1);
              return (
                <div key={p.key} className="rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="h-6 w-6 rounded-md text-white text-[10px] font-bold inline-flex items-center justify-center"
                      style={{ backgroundColor: PLATFORM_COLORS[p.key] || "#64748b" }}
                    >
                      {p.platform.charAt(0)}
                    </span>
                    <span className="text-sm font-medium text-slate-300">{p.platform}</span>
                  </div>
                  <p className="text-xl font-bold text-slate-100">{formatNumber(p.count)}</p>
                  <p className="text-xs text-slate-500">{pct}% of mentions</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
