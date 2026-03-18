"use client";

import React from "react";
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
import { formatNumber } from "@/lib/utils";
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
    <div className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 shadow-xl text-xs">
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
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CompetitiveChartsProps {
  sovData: Array<{ name: string; mentions: number; percentage: string; fill: string }>;
  sentimentComparisonData: Array<{ name: string; positive: number; neutral: number; negative: number; fill: string }>;
  trendData: Array<Record<string, any>>;
  platformComparisonData: Array<Record<string, string | number>>;
  competitorData: Array<{ project: { id: number; name: string }; metrics: any }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompetitiveCharts({
  sovData,
  sentimentComparisonData,
  trendData,
  platformComparisonData,
  competitorData,
}: CompetitiveChartsProps) {
  return (
    <>
      {/* Row 2: Share of Voice + Sentiment Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Share of Voice */}
        <Card>
          <CardHeader>
            <CardTitle>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} width={100} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.05)" }} />
                  <Bar dataKey="mentions" radius={[0, 4, 4, 0]} barSize={28}>
                    {sovData.map((_, idx) => (
                      <Cell key={`sov-${idx}`} fill={PROJECT_COLORS[idx % PROJECT_COLORS.length]} />
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
                <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PROJECT_COLORS[idx % PROJECT_COLORS.length] }} />
                  <span className="text-slate-300">{entry.name}</span>
                  <span className="text-slate-500">{entry.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>
              Sentiment Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sentimentComparisonData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.05)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Bar dataKey="positive" fill="#34d399" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="neutral" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="negative" fill="#f87171" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No sentiment data" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Trend Comparison (full width) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            Mention Trend Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#475569" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                {competitorData.map((d, idx) => (
                  <Line
                    key={d.project.id}
                    type="monotone"
                    dataKey={d.project.name}
                    stroke={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
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
      <Card>
        <CardHeader>
          <CardTitle>
            Platform Breakdown Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {platformComparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={platformComparisonData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="platform" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={{ stroke: "#475569" }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.05)" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                {competitorData.map((d, idx) => (
                  <Bar
                    key={d.project.id}
                    dataKey={d.project.name}
                    fill={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
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
  );
}
