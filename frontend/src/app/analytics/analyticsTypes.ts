export interface DashboardMetrics {
  total_mentions: number;
  mentions_change: number;
  total_engagement: number;
  engagement_change: number;
  avg_sentiment: number;
  sentiment_change: number;
  total_reach: number;
  reach_change: number;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  platform_breakdown: Record<string, number>;
  mentions_over_time: { date: string; count: number }[];
  sentiment_over_time: { date: string; positive: number; neutral: number; negative: number }[];
  engagement_over_time: { date: string; likes: number; shares: number; comments: number }[];
  top_authors: { name: string; handle: string; mentions: number; platform: string }[];
  top_keywords: { keyword: string; count: number }[];
}

export const COLORS = {
  positive: "#22c55e",
  neutral: "#64748b",
  negative: "#ef4444",
  indigo: "#818cf8",
  purple: "#a78bfa",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

// Re-export shared constants so existing imports keep working
export { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/constants";

export const PIE_COLORS = [COLORS.positive, COLORS.neutral, COLORS.negative];
