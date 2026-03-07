"use client";

import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
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
  Download,
  Bot,
  User,
  Star,
  ExternalLink,
  Clock,
  Hash,
  Sparkles,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/Tabs";

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

const COLORS = {
  positive: "#22c55e",
  neutral: "#64748b",
  negative: "#ef4444",
  indigo: "#818cf8",
  purple: "#a78bfa",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

const PLATFORM_COLORS: Record<string, string> = {
  Twitter: "#1DA1F2",
  Facebook: "#1877F2",
  Instagram: "#E4405F",
  LinkedIn: "#0A66C2",
  YouTube: "#FF0000",
  Reddit: "#FF4500",
  News: "#6366f1",
  Blogs: "#8b5cf6",
};

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function makeDateSeries(days: number) {
  const result = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return result;
}

function generateSentimentOverTime(days: number) {
  const dates = makeDateSeries(days);
  return dates.map((date) => {
    const pos = 30 + Math.floor(Math.random() * 30);
    const neg = 8 + Math.floor(Math.random() * 15);
    const neu = 100 - pos - neg;
    return { date, positive: pos, neutral: neu, negative: neg };
  });
}

function generateSentimentByPlatform() {
  const platforms = ["Twitter", "Facebook", "Instagram", "LinkedIn", "YouTube", "Reddit"];
  return platforms.map((platform) => ({
    platform,
    positive: 30 + Math.floor(Math.random() * 35),
    neutral: 20 + Math.floor(Math.random() * 20),
    negative: 5 + Math.floor(Math.random() * 15),
  }));
}

function generateSentimentHeatmap() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const grid: { day: string; hour: number; value: number }[] = [];
  for (const day of days) {
    for (const hour of hours) {
      // Simulate: business hours are more positive, late night more negative
      const base = hour >= 9 && hour <= 17 ? 0.2 : -0.1;
      const weekend = day === "Sat" || day === "Sun" ? -0.05 : 0.05;
      grid.push({
        day,
        hour,
        value: Math.max(-1, Math.min(1, base + weekend + (Math.random() - 0.5) * 0.6)),
      });
    }
  }
  return { days, hours, grid };
}

function generateTopMentions(sentiment: "positive" | "negative") {
  const posTexts = [
    "Absolutely love the new analytics dashboard! It gives us actionable insights in real-time.",
    "Customer support was incredible today. Issue resolved in under 10 minutes!",
    "The AI-powered sentiment detection is best-in-class. Highly recommend.",
    "Switched from a competitor last month and the improvement is night and day.",
    "Our brand health metrics improved significantly after using this platform.",
  ];
  const negTexts = [
    "The API has been unreliable all week. Getting timeouts during peak hours.",
    "Pricing increase without prior notice is extremely disappointing.",
    "The mobile experience needs serious work. Barely usable on phone.",
    "False positive alerts are flooding our Slack channel. Need better filtering.",
    "Data export feature is painfully slow for large datasets.",
  ];
  const texts = sentiment === "positive" ? posTexts : negTexts;
  return texts.map((text, i) => ({
    id: i + 1,
    text,
    author: `@user${Math.floor(Math.random() * 9000) + 1000}`,
    platform: ["Twitter", "Facebook", "Instagram", "LinkedIn", "Reddit"][i % 5],
    engagement: Math.floor(Math.random() * 2000) + 50,
    score: sentiment === "positive"
      ? +(0.6 + Math.random() * 0.4).toFixed(2)
      : +(-0.6 - Math.random() * 0.4).toFixed(2),
  }));
}

function generateEngagementOverTime(days: number) {
  const dates = makeDateSeries(days);
  return dates.map((date) => ({
    date,
    likes: Math.floor(Math.random() * 5000) + 1000,
    shares: Math.floor(Math.random() * 1500) + 200,
    comments: Math.floor(Math.random() * 800) + 100,
  }));
}

function generateTopEngagingPosts() {
  const posts = [
    { author: "@techinnovator", text: "Breaking: Major product announcement coming next week...", platform: "Twitter" },
    { author: "@bizreporter", text: "Exclusive interview with the CEO reveals ambitious growth plans...", platform: "LinkedIn" },
    { author: "@devlife", text: "Just shipped our biggest feature update yet. Here is what is new...", platform: "Twitter" },
    { author: "@startupdigest", text: "This company just disrupted the entire social listening market...", platform: "Reddit" },
    { author: "@marketingpro", text: "Case study: How we used social listening to increase conversions by 340%...", platform: "Facebook" },
    { author: "@datanerds", text: "The sentiment analysis accuracy is genuinely impressive. Full benchmark...", platform: "Twitter" },
    { author: "@cloudexperts", text: "New integration with major CRM platforms just announced...", platform: "LinkedIn" },
    { author: "@brandwatch", text: "Competitive analysis shows interesting positioning in the enterprise segment...", platform: "Instagram" },
  ];
  return posts.map((p, i) => ({
    ...p,
    id: i + 1,
    likes: Math.floor(Math.random() * 8000) + 500,
    shares: Math.floor(Math.random() * 3000) + 100,
    comments: Math.floor(Math.random() * 1200) + 50,
    virality: +(Math.random() * 100).toFixed(1),
  }));
}

function generateEngagementByPlatform() {
  const platforms = ["Twitter", "Facebook", "Instagram", "LinkedIn", "YouTube", "Reddit"];
  return platforms.map((platform) => ({
    platform,
    engagement: Math.floor(Math.random() * 80) + 20,
  }));
}

function generatePlatformDistribution() {
  return [
    { name: "Twitter", value: 32, color: PLATFORM_COLORS.Twitter },
    { name: "Facebook", value: 18, color: PLATFORM_COLORS.Facebook },
    { name: "Instagram", value: 15, color: PLATFORM_COLORS.Instagram },
    { name: "LinkedIn", value: 12, color: PLATFORM_COLORS.LinkedIn },
    { name: "YouTube", value: 8, color: PLATFORM_COLORS.YouTube },
    { name: "Reddit", value: 10, color: PLATFORM_COLORS.Reddit },
    { name: "News", value: 3, color: PLATFORM_COLORS.News },
    { name: "Blogs", value: 2, color: PLATFORM_COLORS.Blogs },
  ];
}

function generateTopAuthors() {
  const names = [
    { handle: "@sarahchen", name: "Sarah Chen", isBot: false },
    { handle: "@techdaily", name: "TechDaily", isBot: false },
    { handle: "@botnews247", name: "BotNews247", isBot: true },
    { handle: "@mrivera", name: "Mark Rivera", isBot: false },
    { handle: "@autopost_ai", name: "AutoPost AI", isBot: true },
    { handle: "@datapulse", name: "DataPulse", isBot: false },
    { handle: "@janedoe", name: "Jane Doe", isBot: false },
    { handle: "@newsbot9k", name: "NewsBot9K", isBot: true },
    { handle: "@cloudnative", name: "CloudNative", isBot: false },
    { handle: "@alexkim", name: "Alex Kim", isBot: false },
  ];
  return names.map((n, i) => ({
    ...n,
    followers: Math.floor(Math.random() * 500000) + 1000,
    mentions: Math.floor(Math.random() * 200) + 10,
    avgSentiment: +((Math.random() - 0.2) * 1).toFixed(2),
    influence: +(Math.random() * 100).toFixed(1),
  }));
}

function generateBotVsHuman() {
  const botPct = 12 + Math.floor(Math.random() * 10);
  return [
    { name: "Human", value: 100 - botPct, color: "#22c55e" },
    { name: "Bot", value: botPct, color: "#ef4444" },
  ];
}

function generateWordCloud() {
  const words = [
    "product", "launch", "pricing", "support", "AI", "dashboard",
    "analytics", "sentiment", "brand", "customer", "innovation",
    "partnership", "growth", "mobile", "API", "integration",
    "enterprise", "startup", "data", "privacy", "security",
    "performance", "update", "feature", "experience", "service",
    "quality", "value", "platform", "community", "feedback",
    "strategy", "market", "competition", "scalability", "design",
  ];
  return words.map((word) => ({
    text: word,
    weight: Math.floor(Math.random() * 80) + 20,
    sentiment: Math.random() > 0.3 ? (Math.random() > 0.5 ? "positive" : "neutral") : "negative",
  }));
}

function generateTopicTrends(days: number) {
  const dates = makeDateSeries(days);
  const topics = ["Product Launch", "Customer Service", "Pricing", "AI Features", "Mobile App"];
  return dates.map((date) => {
    const entry: Record<string, any> = { date };
    topics.forEach((t) => {
      entry[t] = Math.floor(Math.random() * 80) + 10;
    });
    return entry;
  });
}

function generateKeywordPerformance() {
  const keywords = [
    "brand name", "product launch", "customer support", "pricing",
    "mobile app", "AI", "integration", "dashboard", "analytics", "API",
  ];
  return keywords.map((keyword) => ({
    keyword,
    mentions: Math.floor(Math.random() * 1500) + 100,
    avgSentiment: +((Math.random() - 0.2) * 1).toFixed(2),
    trend: Math.random() > 0.3 ? (Math.random() > 0.4 ? "up" : "flat") : "down",
  }));
}

function generateEmergingTopics() {
  return [
    { name: "AI Copilot Feature", growth: 340, firstSeen: "2 days ago" },
    { name: "Enterprise Pricing Tier", growth: 210, firstSeen: "4 days ago" },
    { name: "Open Source SDK", growth: 180, firstSeen: "1 day ago" },
    { name: "GDPR Compliance Update", growth: 150, firstSeen: "3 days ago" },
    { name: "Mobile App Redesign", growth: 120, firstSeen: "5 days ago" },
  ];
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name ?? p.dataKey}: <span className="font-semibold">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-500" />;
}

function SentimentColor(value: number): string {
  if (value > 0.3) return "text-emerald-400";
  if (value < -0.3) return "text-red-400";
  return "text-slate-400";
}

function heatmapColor(value: number): string {
  // value from -1 to 1 mapped to red -> yellow -> green
  if (value > 0.4) return "bg-emerald-500";
  if (value > 0.2) return "bg-emerald-700";
  if (value > 0) return "bg-emerald-900";
  if (value > -0.2) return "bg-slate-700";
  if (value > -0.4) return "bg-red-900";
  return "bg-red-600";
}

// ---------------------------------------------------------------------------
// Analytics Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [activeTab, setActiveTab] = useState("sentiment");

  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;

  // Memoised mock data
  const sentimentOverTime = useMemo(() => generateSentimentOverTime(days), [days]);
  const sentimentByPlatform = useMemo(() => generateSentimentByPlatform(), [days]);
  const heatmapData = useMemo(() => generateSentimentHeatmap(), [days]);
  const topPositive = useMemo(() => generateTopMentions("positive"), [days]);
  const topNegative = useMemo(() => generateTopMentions("negative"), [days]);

  const engagementOverTime = useMemo(() => generateEngagementOverTime(days), [days]);
  const topEngaging = useMemo(() => generateTopEngagingPosts(), [days]);
  const engagementByPlatform = useMemo(() => generateEngagementByPlatform(), [days]);

  const platformDistribution = useMemo(() => generatePlatformDistribution(), [days]);
  const topAuthors = useMemo(() => generateTopAuthors(), [days]);
  const botVsHuman = useMemo(() => generateBotVsHuman(), [days]);

  const wordCloud = useMemo(() => generateWordCloud(), [days]);
  const topicTrends = useMemo(() => generateTopicTrends(days), [days]);
  const keywordPerformance = useMemo(() => generateKeywordPerformance(), [days]);
  const emergingTopics = useMemo(() => generateEmergingTopics(), [days]);

  const handleExport = () => {
    // Stub: in a real app this would trigger a download
    if (typeof window !== "undefined") {
      // Use dynamic import or simple alert as a fallback
      alert("Export started. You will receive a download link shortly.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-slate-700 bg-slate-900">
              {(["7d", "30d", "90d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    timeRange === r
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 w-fit">
            <TabsTrigger
              value="sentiment"
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "sentiment"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Sentiment
            </TabsTrigger>
            <TabsTrigger
              value="engagement"
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "engagement"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Engagement
            </TabsTrigger>
            <TabsTrigger
              value="sources"
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "sources"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Sources & Authors
            </TabsTrigger>
            <TabsTrigger
              value="topics"
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "topics"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Topics & Keywords
            </TabsTrigger>
          </TabsList>

          {/* ==============================================================
              TAB 1: Sentiment Analysis
          ============================================================== */}
          <TabsContent value="sentiment" className="space-y-6">
            {/* Sentiment Over Time - Stacked Area */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Sentiment Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sentimentOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: "#334155" }}
                        tickLine={false}
                        interval={Math.floor(days / 6)}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: "#334155" }}
                        tickLine={false}
                        width={35}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                      <Area
                        type="monotone"
                        dataKey="positive"
                        stackId="1"
                        stroke={COLORS.positive}
                        fill={COLORS.positive}
                        fillOpacity={0.6}
                        name="Positive"
                      />
                      <Area
                        type="monotone"
                        dataKey="neutral"
                        stackId="1"
                        stroke={COLORS.neutral}
                        fill={COLORS.neutral}
                        fillOpacity={0.4}
                        name="Neutral"
                      />
                      <Area
                        type="monotone"
                        dataKey="negative"
                        stackId="1"
                        stroke={COLORS.negative}
                        fill={COLORS.negative}
                        fillOpacity={0.6}
                        name="Negative"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Sentiment by Platform - Grouped Bar */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Sentiment by Platform
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sentimentByPlatform}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="platform"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#334155" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: "#334155" }}
                        tickLine={false}
                        width={35}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                      <Bar dataKey="positive" fill={COLORS.positive} radius={[2, 2, 0, 0]} name="Positive" />
                      <Bar dataKey="neutral" fill={COLORS.neutral} radius={[2, 2, 0, 0]} name="Neutral" />
                      <Bar dataKey="negative" fill={COLORS.negative} radius={[2, 2, 0, 0]} name="Negative" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Sentiment Heatmap */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Sentiment Heatmap (Day x Hour)
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="min-w-[700px]">
                  {/* Hour labels */}
                  <div className="mb-1 flex">
                    <div className="w-12 shrink-0" />
                    {heatmapData.hours.map((h) => (
                      <div
                        key={h}
                        className="flex-1 text-center text-[10px] text-slate-500"
                      >
                        {h % 3 === 0 ? `${h}:00` : ""}
                      </div>
                    ))}
                  </div>
                  {/* Grid rows */}
                  {heatmapData.days.map((day) => (
                    <div key={day} className="mb-0.5 flex items-center">
                      <div className="w-12 shrink-0 text-xs text-slate-500">{day}</div>
                      <div className="flex flex-1 gap-0.5">
                        {heatmapData.grid
                          .filter((c) => c.day === day)
                          .map((cell) => (
                            <div
                              key={`${cell.day}-${cell.hour}`}
                              className={cn(
                                "flex-1 h-6 rounded-sm transition-colors",
                                heatmapColor(cell.value)
                              )}
                              title={`${cell.day} ${cell.hour}:00 — Sentiment: ${cell.value.toFixed(2)}`}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-500">
                    <span>Negative</span>
                    <div className="flex gap-0.5">
                      <div className="h-3 w-6 rounded-sm bg-red-600" />
                      <div className="h-3 w-6 rounded-sm bg-red-900" />
                      <div className="h-3 w-6 rounded-sm bg-slate-700" />
                      <div className="h-3 w-6 rounded-sm bg-emerald-900" />
                      <div className="h-3 w-6 rounded-sm bg-emerald-700" />
                      <div className="h-3 w-6 rounded-sm bg-emerald-500" />
                    </div>
                    <span>Positive</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Positive / Top Negative side by side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-400">
                    Top Positive Mentions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topPositive.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-md border border-emerald-900/30 bg-emerald-950/20 p-3"
                    >
                      <p className="text-sm text-slate-300">{m.text}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <span>{m.author}</span>
                        <span>{m.platform}</span>
                        <span className="text-emerald-400">Score: {m.score}</span>
                        <span>{m.engagement.toLocaleString()} engagements</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-red-400">
                    Top Negative Mentions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topNegative.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-md border border-red-900/30 bg-red-950/20 p-3"
                    >
                      <p className="text-sm text-slate-300">{m.text}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <span>{m.author}</span>
                        <span>{m.platform}</span>
                        <span className="text-red-400">Score: {m.score}</span>
                        <span>{m.engagement.toLocaleString()} engagements</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ==============================================================
              TAB 2: Engagement
          ============================================================== */}
          <TabsContent value="engagement" className="space-y-6">
            {/* Engagement Over Time */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Engagement Over Time
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={engagementOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      interval={Math.floor(days / 6)}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                    <Line type="monotone" dataKey="likes" stroke={COLORS.rose} strokeWidth={2} dot={false} name="Likes" />
                    <Line type="monotone" dataKey="shares" stroke={COLORS.cyan} strokeWidth={2} dot={false} name="Shares" />
                    <Line type="monotone" dataKey="comments" stroke={COLORS.amber} strokeWidth={2} dot={false} name="Comments" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Top Engaging Posts */}
              <Card className="border-slate-800 bg-slate-900/60 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Top Engaging Posts
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Author</th>
                        <th className="pb-2 pr-3 font-medium">Content</th>
                        <th className="pb-2 pr-3 font-medium">Platform</th>
                        <th className="pb-2 pr-3 font-medium text-right">Likes</th>
                        <th className="pb-2 pr-3 font-medium text-right">Shares</th>
                        <th className="pb-2 font-medium text-right">Virality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topEngaging.map((post) => (
                        <tr
                          key={post.id}
                          className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                        >
                          <td className="py-2.5 pr-3 text-xs font-medium text-indigo-400">
                            {post.author}
                          </td>
                          <td className="max-w-xs truncate py-2.5 pr-3 text-slate-400">
                            {post.text}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-500">{post.platform}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-slate-300">
                            {post.likes.toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-slate-300">
                            {post.shares.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right">
                            <Badge
                              className={cn(
                                "text-[10px] border",
                                post.virality > 70
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              )}
                            >
                              {post.virality}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Engagement by Platform - Radar */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Engagement by Platform
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={engagementByPlatform} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis
                        dataKey="platform"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <PolarRadiusAxis
                        tick={{ fill: "#475569", fontSize: 9 }}
                        axisLine={false}
                      />
                      <Radar
                        name="Engagement"
                        dataKey="engagement"
                        stroke={COLORS.indigo}
                        fill={COLORS.indigo}
                        fillOpacity={0.3}
                      />
                      <Tooltip content={<ChartTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Viral Content Cards */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Viral Content
                  <span className="ml-2 text-xs text-slate-500">(virality score &gt; 70)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {topEngaging
                    .filter((p) => p.virality > 70)
                    .map((post) => (
                      <div
                        key={post.id}
                        className="rounded-lg border border-rose-900/30 bg-rose-950/10 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-indigo-400">{post.author}</span>
                          <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
                            Virality: {post.virality}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300">{post.text}</p>
                        <div className="mt-2 flex gap-4 text-xs text-slate-500">
                          <span>{post.likes.toLocaleString()} likes</span>
                          <span>{post.shares.toLocaleString()} shares</span>
                          <span>{post.comments.toLocaleString()} comments</span>
                        </div>
                      </div>
                    ))}
                  {topEngaging.filter((p) => p.virality > 70).length === 0 && (
                    <p className="col-span-full text-center text-sm text-slate-500 py-8">
                      No viral content detected in this period.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==============================================================
              TAB 3: Sources & Authors
          ============================================================== */}
          <TabsContent value="sources" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Platform Distribution Donut */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Platform Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-72 flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="80%">
                    <PieChart>
                      <Pie
                        data={platformDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={false}
                      >
                        {platformDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                    {platformDistribution.map((p) => (
                      <div key={p.name} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bot vs Human Donut */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Bot vs Human Authors
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-72 flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="75%">
                    <PieChart>
                      <Pie
                        data={botVsHuman}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={false}
                      >
                        {botVsHuman.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs text-slate-400">
                    {botVsHuman.map((b) => (
                      <div key={b.name} className="flex items-center gap-1.5">
                        {b.name === "Bot" ? (
                          <Bot className="h-3 w-3 text-red-400" />
                        ) : (
                          <User className="h-3 w-3 text-emerald-400" />
                        )}
                        {b.name}: {b.value}%
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Author Network Placeholder */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Author Network
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-72 flex-col items-center justify-center text-center">
                  <div className="rounded-full border border-slate-700 bg-slate-800/50 p-4">
                    <Sparkles className="h-8 w-8 text-indigo-400" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-300">Coming Soon</p>
                  <p className="mt-1 max-w-[200px] text-xs text-slate-500">
                    Interactive network graph showing author relationships and influence clusters.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top Authors Table */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Top Authors
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 pr-4 font-medium">Handle</th>
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium text-right">Followers</th>
                      <th className="pb-2 pr-4 font-medium text-right">Mentions</th>
                      <th className="pb-2 pr-4 font-medium text-right">Avg Sentiment</th>
                      <th className="pb-2 pr-4 font-medium text-right">Influence</th>
                      <th className="pb-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAuthors.map((author) => (
                      <tr
                        key={author.handle}
                        className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                      >
                        <td className="py-2.5 pr-4 font-medium text-indigo-400">
                          {author.handle}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-300">{author.name}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">
                          {author.followers >= 1000
                            ? `${(author.followers / 1000).toFixed(1)}K`
                            : author.followers}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">
                          {author.mentions}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 pr-4 text-right tabular-nums",
                            SentimentColor(author.avgSentiment)
                          )}
                        >
                          {author.avgSentiment.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">
                          {author.influence}
                        </td>
                        <td className="py-2.5">
                          {author.isBot ? (
                            <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">
                              Bot
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                              Human
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==============================================================
              TAB 4: Topics & Keywords
          ============================================================== */}
          <TabsContent value="topics" className="space-y-6">
            {/* Word Cloud */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Word Cloud
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex min-h-[200px] flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4">
                  {wordCloud.map((word) => {
                    const size = Math.max(12, Math.min(36, word.weight * 0.4));
                    const color =
                      word.sentiment === "positive"
                        ? "#22c55e"
                        : word.sentiment === "negative"
                        ? "#ef4444"
                        : "#94a3b8";
                    return (
                      <span
                        key={word.text}
                        className="cursor-default transition-transform hover:scale-110"
                        style={{
                          fontSize: `${size}px`,
                          color,
                          fontWeight: word.weight > 60 ? 700 : word.weight > 40 ? 500 : 400,
                          opacity: 0.6 + (word.weight / 100) * 0.4,
                        }}
                      >
                        {word.text}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Topic Trend Lines */}
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Topic Trends
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={topicTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      interval={Math.floor(days / 6)}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                    <Line type="monotone" dataKey="Product Launch" stroke="#818cf8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Customer Service" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Pricing" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="AI Features" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Mobile App" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Keyword Performance Table */}
              <Card className="border-slate-800 bg-slate-900/60 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Keyword Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Keyword</th>
                        <th className="pb-2 pr-4 font-medium text-right">Mentions</th>
                        <th className="pb-2 pr-4 font-medium text-right">Avg Sentiment</th>
                        <th className="pb-2 font-medium text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywordPerformance.map((kw) => (
                        <tr
                          key={kw.keyword}
                          className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3 w-3 text-slate-600" />
                              <span className="text-slate-300">{kw.keyword}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">
                            {kw.mentions.toLocaleString()}
                          </td>
                          <td
                            className={cn(
                              "py-2.5 pr-4 text-right tabular-nums",
                              SentimentColor(kw.avgSentiment)
                            )}
                          >
                            {kw.avgSentiment.toFixed(2)}
                          </td>
                          <td className="py-2.5 text-center">
                            <TrendIcon trend={kw.trend} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Emerging Topics */}
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">
                    Emerging Topics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {emergingTopics.map((topic) => (
                    <div
                      key={topic.name}
                      className="rounded-md border border-indigo-900/30 bg-indigo-950/10 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-200">{topic.name}</span>
                        <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px]">
                          +{topic.growth}%
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        First seen {topic.firstSeen}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
