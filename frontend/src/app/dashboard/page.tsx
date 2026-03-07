"use client";

import React, { useState, useMemo } from "react";
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
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Heart,
  Share2,
  Eye,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Clock,
  ChevronDown,
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

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function generateMentionTimeSeries(days: number) {
  const data = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const base = 120 + Math.floor(Math.random() * 80);
    const positive = Math.floor(base * (0.35 + Math.random() * 0.15));
    const negative = Math.floor(base * (0.1 + Math.random() * 0.1));
    const neutral = base - positive - negative;
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: base,
      positive,
      negative,
      neutral,
    });
  }
  return data;
}

function generateSentimentDistribution() {
  const positive = 42 + Math.floor(Math.random() * 10);
  const negative = 12 + Math.floor(Math.random() * 8);
  const neutral = 100 - positive - negative;
  return [
    { name: "Positive", value: positive, color: "#22c55e" },
    { name: "Neutral", value: neutral, color: "#94a3b8" },
    { name: "Negative", value: negative, color: "#ef4444" },
  ];
}

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

function generatePlatformData() {
  return [
    { platform: "Twitter", mentions: 1840 + Math.floor(Math.random() * 400) },
    { platform: "Facebook", mentions: 920 + Math.floor(Math.random() * 200) },
    { platform: "Instagram", mentions: 760 + Math.floor(Math.random() * 200) },
    { platform: "LinkedIn", mentions: 540 + Math.floor(Math.random() * 150) },
    { platform: "YouTube", mentions: 320 + Math.floor(Math.random() * 100) },
    { platform: "Reddit", mentions: 680 + Math.floor(Math.random() * 200) },
    { platform: "News", mentions: 440 + Math.floor(Math.random() * 120) },
    { platform: "Blogs", mentions: 210 + Math.floor(Math.random() * 80) },
  ].sort((a, b) => b.mentions - a.mentions);
}

function generateTrendingTopics() {
  const topics = [
    "Product Launch",
    "Customer Service",
    "Pricing Update",
    "CEO Interview",
    "Sustainability",
    "Q4 Earnings",
    "Partnership",
    "Mobile App",
    "Data Privacy",
    "AI Features",
  ];
  return topics.map((name, i) => ({
    name,
    mentions: Math.floor(600 - i * 50 + Math.random() * 80),
    sentiment: Math.random() > 0.3 ? (Math.random() > 0.5 ? "positive" : "neutral") : "negative",
    trend: Math.random() > 0.3 ? (Math.random() > 0.4 ? "up" : "flat") : "down",
  }));
}

function generateAlerts() {
  const severities = ["critical", "high", "medium", "low"] as const;
  const titles = [
    "Spike in negative mentions detected",
    "Viral post gaining traction",
    "Competitor mention surge",
    "Influencer mentioned your brand",
    "Unusual bot activity detected",
  ];
  return titles.map((title, i) => ({
    id: i + 1,
    severity: severities[i % severities.length],
    title,
    timeAgo: `${(i + 1) * 2}h ago`,
  }));
}

function generateRecentMentions() {
  const platforms = ["Twitter", "Facebook", "Instagram", "LinkedIn", "Reddit"] as const;
  const authors = [
    { name: "Sarah Chen", handle: "@sarahchen" },
    { name: "TechDaily", handle: "@techdaily" },
    { name: "Mark Rivera", handle: "@mrivera" },
    { name: "DataPulse", handle: "@datapulse" },
    { name: "Jane Doe", handle: "@janedoe" },
    { name: "AI Weekly", handle: "@aiweekly" },
    { name: "BizInsider", handle: "@bizinsider" },
    { name: "Alex Kim", handle: "@alexkim" },
    { name: "CloudNative", handle: "@cloudnative" },
    { name: "FutureStack", handle: "@futurestack" },
  ];
  const texts = [
    "Just tried the new dashboard feature from @khushfus and it is absolutely incredible for tracking brand sentiment across platforms.",
    "Not impressed with the latest update. The UI feels cluttered and response times have degraded significantly since last week.",
    "Great customer support experience today! Resolved my issue within 15 minutes. Kudos to the team for the quick turnaround.",
    "Comparing @khushfus vs competitors: the sentiment analysis accuracy is noticeably better, especially for nuanced language.",
    "Anyone else having trouble with the API rate limits? Getting 429 errors consistently during peak hours.",
    "The new AI-powered alert system caught a brand crisis before it went viral. Saved our PR team hours of reactive work.",
    "Pricing feels a bit steep for small businesses. Would love to see a startup tier with reduced feature set.",
    "Integration with Slack is seamless. Our marketing team now gets real-time alerts directly in their workflow.",
    "The sentiment heatmap is my favorite feature. Gives such clear visibility into when negative chatter peaks.",
    "Switched from a competitor last month. The data quality and coverage are significantly better across all platforms.",
  ];
  const sentiments = ["positive", "negative", "positive", "positive", "negative", "positive", "neutral", "positive", "positive", "positive"] as const;
  return authors.map((author, i) => ({
    id: i + 1,
    platform: platforms[i % platforms.length],
    author,
    text: texts[i],
    sentiment: sentiments[i],
    likes: Math.floor(Math.random() * 500),
    shares: Math.floor(Math.random() * 120),
    comments: Math.floor(Math.random() * 80),
    time: `${Math.floor(Math.random() * 23) + 1}h ago`,
  }));
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-slate-400",
  negative: "bg-red-400",
};

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  neutral: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  negative: "bg-red-500/10 text-red-400 border-red-500/20",
};

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-500" />;
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (platform) {
    case "Twitter":
      return <Twitter className={cls} style={{ color: "#1DA1F2" }} />;
    case "Facebook":
      return <Facebook className={cls} style={{ color: "#1877F2" }} />;
    case "Instagram":
      return <Instagram className={cls} style={{ color: "#E4405F" }} />;
    case "LinkedIn":
      return <Linkedin className={cls} style={{ color: "#0A66C2" }} />;
    case "YouTube":
      return <Youtube className={cls} style={{ color: "#FF0000" }} />;
    default:
      return <MessageSquare className={cls} style={{ color: "#6366f1" }} />;
  }
}

// Sparkline: tiny inline SVG line
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block ml-2">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedProject, setSelectedProject] = useState("proj-1");
  const [isLoading, setIsLoading] = useState(false);

  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;

  // Mock data (memoised so it doesn't regenerate on every render within the same range)
  const mentionTimeSeries = useMemo(() => generateMentionTimeSeries(days), [days]);
  const sentimentDistribution = useMemo(() => generateSentimentDistribution(), [days]);
  const platformData = useMemo(() => generatePlatformData(), [days]);
  const trendingTopics = useMemo(() => generateTrendingTopics(), [days]);
  const alerts = useMemo(() => generateAlerts(), [days]);
  const recentMentions = useMemo(() => generateRecentMentions(), [days]);

  // Derived stats
  const totalMentions = useMemo(
    () => mentionTimeSeries.reduce((s, d) => s + d.total, 0),
    [mentionTimeSeries]
  );
  const prevPeriodMentions = Math.floor(totalMentions * (0.85 + Math.random() * 0.25));
  const mentionChange = ((totalMentions - prevPeriodMentions) / prevPeriodMentions) * 100;
  const avgSentiment = 0.24 + Math.random() * 0.2;
  const totalReach = 1_240_000 + Math.floor(Math.random() * 500_000);
  const activeAlerts = alerts.length;

  // Sparkline data for stat cards
  const sparkMentions = mentionTimeSeries.slice(-14).map((d) => d.total);
  const sparkSentiment = mentionTimeSeries.slice(-14).map((d) => d.positive / (d.total || 1));
  const sparkReach = mentionTimeSeries.slice(-14).map((_, i) => 40000 + Math.floor(Math.random() * 20000));
  const sparkAlerts = mentionTimeSeries.slice(-14).map(() => Math.floor(Math.random() * 5));

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Select
              value={selectedProject}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedProject(e.target.value)}
              className="h-9 w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300"
            >
              <option value="proj-1">Acme Corp</option>
              <option value="proj-2">Globex Inc</option>
              <option value="proj-3">Initech</option>
            </Select>
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {/* ================================================================
            ROW 1 - Stat Cards
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Total Mentions */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Mentions</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {totalMentions.toLocaleString()}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {mentionChange >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                    )}
                    <span className={mentionChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {Math.abs(mentionChange).toFixed(1)}%
                    </span>
                    <span className="text-slate-500">vs prev period</span>
                  </div>
                </div>
                <Sparkline data={sparkMentions} color="#6366f1" />
              </div>
            </CardContent>
          </Card>

          {/* Average Sentiment */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Avg Sentiment</p>
                  <p
                    className={cn(
                      "mt-1 text-3xl font-bold tracking-tight",
                      avgSentiment > 0.3
                        ? "text-emerald-400"
                        : avgSentiment < -0.3
                        ? "text-red-400"
                        : "text-slate-200"
                    )}
                  >
                    {avgSentiment.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {avgSentiment > 0.3 ? "Mostly positive" : avgSentiment < -0.3 ? "Mostly negative" : "Mixed sentiment"}
                  </p>
                </div>
                <Sparkline data={sparkSentiment} color={avgSentiment > 0.3 ? "#22c55e" : "#94a3b8"} />
              </div>
            </CardContent>
          </Card>

          {/* Total Reach */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Total Reach</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {totalReach >= 1_000_000
                      ? `${(totalReach / 1_000_000).toFixed(1)}M`
                      : `${(totalReach / 1_000).toFixed(0)}K`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Estimated impressions</p>
                </div>
                <Sparkline data={sparkReach} color="#a78bfa" />
              </div>
            </CardContent>
          </Card>

          {/* Active Alerts */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Active Alerts</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-3xl font-bold tracking-tight">{activeAlerts}</p>
                    <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">
                      {alerts.filter((a) => a.severity === "critical").length} critical
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Requires attention</p>
                </div>
                <Sparkline data={sparkAlerts} color="#f59e0b" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 2 - Charts (Line + Pie)
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Mention Volume Over Time */}
          <Card className="border-slate-800 bg-slate-900/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Mention Volume Over Time
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mentionTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    interval={Math.floor(days / 8)}
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
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={false}
                    name="Total"
                  />
                  <Line
                    type="monotone"
                    dataKey="positive"
                    stroke="#22c55e"
                    strokeWidth={1.5}
                    dot={false}
                    name="Positive"
                  />
                  <Line
                    type="monotone"
                    dataKey="negative"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    dot={false}
                    name="Negative"
                  />
                  <Line
                    type="monotone"
                    dataKey="neutral"
                    stroke="#64748b"
                    strokeWidth={1.5}
                    dot={false}
                    name="Neutral"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sentiment Distribution Pie */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Sentiment Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-72 flex-col items-center justify-center">
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
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 3 - Platform Breakdown / Trending Topics / Recent Alerts
        ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Platform Breakdown (horizontal bar) */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Platform Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
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
            </CardContent>
          </Card>

          {/* Trending Topics */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Trending Topics
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              <ul className="space-y-2">
                {trendingTopics.map((topic, i) => (
                  <li
                    key={topic.name}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-xs text-slate-500">{i + 1}.</span>
                      <span
                        className={cn("h-2 w-2 rounded-full", SENTIMENT_DOT[topic.sentiment])}
                      />
                      <span className="text-slate-200">{topic.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-slate-400">
                        {topic.mentions.toLocaleString()}
                      </span>
                      <TrendIcon trend={topic.trend} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto pr-1">
              <ul className="space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-800/50"
                  >
                    <Badge
                      className={cn(
                        "mt-0.5 shrink-0 border text-[10px] uppercase tracking-wider",
                        SEVERITY_COLORS[alert.severity]
                      )}
                    >
                      {alert.severity}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">{alert.title}</p>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {alert.timeAgo}
                      </div>
                    </div>
                    <button className="shrink-0 text-xs font-medium text-indigo-400 hover:text-indigo-300">
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================
            ROW 4 - Recent Mentions Stream
        ================================================================ */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">
              Recent Mentions
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Platform</th>
                  <th className="pb-2 pr-4 font-medium">Author</th>
                  <th className="pb-2 pr-4 font-medium">Content</th>
                  <th className="pb-2 pr-4 font-medium">Sentiment</th>
                  <th className="pb-2 pr-4 font-medium">Engagement</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentMentions.map((mention) => (
                  <tr
                    key={mention.id}
                    className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30"
                  >
                    <td className="py-3 pr-4">
                      <PlatformIcon platform={mention.platform} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="font-medium text-slate-200">{mention.author.name}</div>
                      <div className="text-xs text-slate-500">{mention.author.handle}</div>
                    </td>
                    <td className="max-w-xs truncate py-3 pr-4 text-slate-400">
                      {mention.text.slice(0, 100)}
                      {mention.text.length > 100 && "..."}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        className={cn(
                          "border text-[10px] capitalize",
                          SENTIMENT_BADGE[mention.sentiment]
                        )}
                      >
                        {mention.sentiment}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {mention.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3 w-3" />
                          {mention.shares}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {mention.comments}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 whitespace-nowrap text-xs text-slate-500">
                      {mention.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
