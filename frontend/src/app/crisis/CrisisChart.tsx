"use client";

/**
 * CrisisChart — Recharts sentiment area chart with red danger-zone overlay.
 *
 * Dynamically imported by crisis/page.tsx to defer Recharts from initial bundle.
 */

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface CrisisChartProps {
  data: ChartDataPoint[];
  /** Negative-ratio percentage above which the red danger zone is rendered */
  dangerThresholdPct?: number;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-slate-900/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 font-semibold text-slate-300">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-400 capitalize">{entry.name}</span>
          </span>
          <span className="font-medium text-slate-200 tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main chart component
// ---------------------------------------------------------------------------

export default function CrisisChart({
  data,
  dangerThresholdPct = 25,
}: CrisisChartProps) {
  // Compute the absolute "danger" value per data point so we can draw a
  // reference line at the threshold percentage applied to the max total.
  const maxTotal = data.reduce(
    (m, d) => Math.max(m, d.positive + d.neutral + d.negative),
    0,
  );
  const dangerLineValue = Math.round((dangerThresholdPct / 100) * maxTotal);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {/* Gradient fills */}
        <defs>
          <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
          {/* Red danger-zone pattern fill */}
          <pattern
            id="dangerPattern"
            x="0"
            y="0"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.15" />
          </pattern>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#1e293b" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#1e293b" }}
          width={36}
        />

        <Tooltip content={<CustomTooltip />} />

        <Legend
          formatter={(value: string) => (
            <span className="text-xs text-slate-400 capitalize">{value}</span>
          )}
        />

        {/* Danger threshold reference line */}
        {dangerLineValue > 0 && (
          <ReferenceLine
            y={dangerLineValue}
            stroke="#ef4444"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{
              value: `Danger (${dangerThresholdPct}%)`,
              position: "insideTopRight",
              fill: "#f87171",
              fontSize: 10,
            }}
          />
        )}

        {/* Areas */}
        <Area
          type="monotone"
          dataKey="positive"
          name="Positive"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#posGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="neutral"
          name="Neutral"
          stroke="#64748b"
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="negative"
          name="Negative"
          stroke="#ef4444"
          strokeWidth={2.5}
          fill="url(#negGrad)"
          dot={false}
          activeDot={{ r: 5, fill: "#ef4444", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
