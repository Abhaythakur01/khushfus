"use client";

import React from "react";
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
import { PLATFORM_COLORS } from "@/lib/constants";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ChartTooltip, EmptyState } from "./DashboardHelpers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardChartsProps {
  mentionTimeSeries: Array<{ date: string; total: number; positive: number; negative: number; neutral: number }>;
  sentimentDistribution: Array<{ name: string; value: number; color: string }>;
  platformData: Array<{ platform: string; mentions: number }>;
  totalMentions: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardCharts({
  mentionTimeSeries,
  sentimentDistribution,
  platformData,
  totalMentions,
}: DashboardChartsProps) {
  return (
    <>
      {/* ================================================================
          ROW 2 - Charts (Line + Pie)
      ================================================================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Mention Volume Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>
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
                  <Line type="monotone" dataKey="total" stroke="#818cf8" strokeWidth={2} dot={false} name="Total" />
                  <Line type="monotone" dataKey="positive" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Positive" />
                  <Line type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Negative" />
                  <Line type="monotone" dataKey="neutral" stroke="#64748b" strokeWidth={1.5} dot={false} name="Neutral" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No mention data yet for this time period" />
            )}
          </CardContent>
        </Card>

        {/* Sentiment Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
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
          ROW 3 - Platform Breakdown (bar chart)
      ================================================================ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
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
    </>
  );
}
