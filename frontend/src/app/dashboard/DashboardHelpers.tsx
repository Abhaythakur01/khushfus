import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// TrendIcon
// ---------------------------------------------------------------------------

export function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-500" />;
}

// ---------------------------------------------------------------------------
// PlatformIcon
// ---------------------------------------------------------------------------

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = cn("h-4 w-4", className);
  const p = platform.toLowerCase();
  switch (p) {
    case "twitter":
      return <Twitter className={cls} style={{ color: "#1DA1F2" }} />;
    case "facebook":
      return <Facebook className={cls} style={{ color: "#1877F2" }} />;
    case "instagram":
      return <Instagram className={cls} style={{ color: "#E4405F" }} />;
    case "linkedin":
      return <Linkedin className={cls} style={{ color: "#0A66C2" }} />;
    case "youtube":
      return <Youtube className={cls} style={{ color: "#FF0000" }} />;
    default:
      return <MessageSquare className={cls} style={{ color: "#6366f1" }} />;
  }
}

// ---------------------------------------------------------------------------
// Sparkline: tiny inline SVG line
// ---------------------------------------------------------------------------

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block ml-2">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export function EmptyState({ message, icon: Icon }: { message: string; icon?: React.ElementType }) {
  const IconComponent = Icon || FolderOpen;
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <IconComponent className="mb-3 h-10 w-10 text-slate-600" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartTooltip
// ---------------------------------------------------------------------------

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#111827]/70 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{(p.value ?? 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeAgo(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Transform functions for chart data
// ---------------------------------------------------------------------------

export interface DashboardData {
  total_mentions: number;
  sentiment: {
    breakdown: { positive: number; negative: number; neutral: number };
    average_score: number;
  };
  /** Flat sentiment breakdown returned by some API response shapes */
  sentiment_breakdown?: Record<string, number>;
  platforms: Record<string, number>;
  engagement: {
    total_likes: number;
    total_shares: number;
    total_comments: number;
    total_reach: number;
  };
  top_contributors: Array<{
    name: string;
    handle: string;
    followers: number;
    platform: string;
    mentions: number;
  }>;
  daily_trend: Array<{ date: string; mentions: number }>;
  /** Additional fields from DashboardMetrics API shape */
  [key: string]: unknown;
}

export interface MentionItem {
  id: number;
  platform: string;
  author_name: string;
  author_handle: string;
  content: string;
  text?: string;
  sentiment: string;
  likes: number;
  shares: number;
  comments: number;
  created_at: string;
  engagement?: {
    likes?: number;
    shares?: number;
    comments?: number;
  };
}

function formatTrendDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function transformDailyTrend(
  dailyTrend: DashboardData["daily_trend"],
  sentimentBreakdown: DashboardData["sentiment"]["breakdown"]
) {
  const total = sentimentBreakdown.positive + sentimentBreakdown.negative + sentimentBreakdown.neutral;
  if (total === 0) {
    return dailyTrend.map((d) => ({
      date: formatTrendDate(d.date),
      total: d.mentions,
      positive: 0,
      negative: 0,
      neutral: d.mentions,
    }));
  }
  const posRatio = sentimentBreakdown.positive / total;
  const negRatio = sentimentBreakdown.negative / total;

  return dailyTrend.map((d) => {
    const positive = Math.round(d.mentions * posRatio);
    const negative = Math.round(d.mentions * negRatio);
    const neutral = d.mentions - positive - negative;
    return {
      date: formatTrendDate(d.date),
      total: d.mentions,
      positive,
      negative,
      neutral: Math.max(0, neutral),
    };
  });
}

export function transformPlatformData(platforms: Record<string, number>) {
  return Object.entries(platforms)
    .map(([platform, mentions]) => ({
      platform: capitalizeFirst(platform),
      mentions,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

export function transformSentimentDistribution(breakdown: DashboardData["sentiment"]["breakdown"]) {
  const total = breakdown.positive + breakdown.negative + breakdown.neutral;
  if (total === 0) {
    return [
      { name: "Positive", value: 0, color: "#22c55e" },
      { name: "Neutral", value: 100, color: "#94a3b8" },
      { name: "Negative", value: 0, color: "#ef4444" },
    ];
  }
  return [
    { name: "Positive", value: Math.round((breakdown.positive / total) * 100), color: "#22c55e" },
    { name: "Neutral", value: Math.round((breakdown.neutral / total) * 100), color: "#94a3b8" },
    { name: "Negative", value: Math.round((breakdown.negative / total) * 100), color: "#ef4444" },
  ];
}
