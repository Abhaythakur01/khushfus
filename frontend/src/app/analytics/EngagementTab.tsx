"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Heart, Share2, MessageCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { ChartTooltip, EmptyState } from "./ChartHelpers";
import { DashboardMetrics } from "./analyticsTypes";

export default function EngagementTab({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="space-y-6">
      {/* Engagement KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4 text-pink-400" />
            <span className="text-sm text-slate-400">Total Likes</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {formatNumber(metrics.engagement_over_time.reduce((a, d) => a + (d.likes || 0), 0) || metrics.total_engagement)}
          </p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-slate-400">Total Shares</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {formatNumber(metrics.engagement_over_time.reduce((a, d) => a + (d.shares || 0), 0))}
          </p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-4 w-4 text-violet-400" />
            <span className="text-sm text-slate-400">Total Comments</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {formatNumber(metrics.engagement_over_time.reduce((a, d) => a + (d.comments || 0), 0))}
          </p>
        </div>
      </div>

      {/* Engagement over time */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Engagement Over Time</h3>
        {metrics.engagement_over_time.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={metrics.engagement_over_time}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(value: string) => <span className="text-xs text-slate-400">{value}</span>} />
              <Line type="monotone" dataKey="likes" name="Likes" stroke="#f472b6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="shares" name="Shares" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="comments" name="Comments" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No engagement data for this period" />
        )}
      </div>

      {/* Engagement by mentions (stacked bar) */}
      {metrics.engagement_over_time.length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Engagement Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.engagement_over_time}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#334155" }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(value: string) => <span className="text-xs text-slate-400">{value}</span>} />
              <Bar dataKey="likes" name="Likes" stackId="eng" fill="#f472b6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="shares" name="Shares" stackId="eng" fill="#60a5fa" />
              <Bar dataKey="comments" name="Comments" stackId="eng" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
