"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardMetrics } from "./analyticsTypes";
import { DateRangePicker, type DateRange } from "@/components/ui/daterange";

// ---------- code-split tab components (6.29 — lazy-load Recharts) ----------

function ChartLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

const OverviewTab = dynamic(() => import("./OverviewTab"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});
const SentimentTab = dynamic(() => import("./SentimentTab"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});
const PlatformsTab = dynamic(() => import("./PlatformsTab"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});
const EngagementTab = dynamic(() => import("./EngagementTab"), {
  ssr: false,
  loading: () => <ChartLoadingPlaceholder />,
});

// ---------- helpers ----------

function daysInRange(range: DateRange): number {
  return Math.max(
    1,
    Math.round(
      (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / 86400_000
    ) + 1
  );
}

// ---------- empty state ----------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Inbox className="h-12 w-12 text-slate-700 mb-3" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------- normalize metrics ----------

function normalizeMetrics(data: any): DashboardMetrics {
  return {
    total_mentions: data.total_mentions ?? data.mentions_count ?? 0,
    mentions_change: data.mentions_change ?? data.mentions_growth ?? 0,
    total_engagement: data.total_engagement ?? (data.total_likes ?? 0) + (data.total_shares ?? 0) + (data.total_comments ?? 0),
    engagement_change: data.engagement_change ?? data.engagement_growth ?? 0,
    avg_sentiment: data.avg_sentiment ?? data.average_sentiment ?? 0,
    sentiment_change: data.sentiment_change ?? 0,
    total_reach: data.total_reach ?? 0,
    reach_change: data.reach_change ?? 0,
    sentiment_breakdown: data.sentiment_breakdown ?? data.sentiment_distribution ?? { positive: 0, neutral: 0, negative: 0 },
    platform_breakdown: data.platform_breakdown ?? data.platform_distribution ?? {},
    mentions_over_time: data.mentions_over_time ?? data.trend ?? [],
    sentiment_over_time: data.sentiment_over_time ?? [],
    engagement_over_time: data.engagement_over_time ?? [],
    top_authors: data.top_authors ?? [],
    top_keywords: data.top_keywords ?? [],
  };
}

// ---------- main page ----------

export default function AnalyticsPage() {
  const { projects, isLoading: projectsLoading } = useProjects();
  const [selectedProject, setSelectedProject] = useState<number>(0);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  });
  const days = daysInRange(dateRange);
  const [activeTab, setActiveTab] = useState("overview");

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].id);
    }
  }, [projects, selectedProject]);

  // Load dashboard metrics
  const fetchMetrics = useCallback(async () => {
    if (!selectedProject) {
      setMetrics(null);
      return;
    }
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await api.getDashboardMetrics(selectedProject, days);
      setMetrics(normalizeMetrics(data));
    } catch (err: any) {
      console.error("Failed to load metrics:", err);
      setMetricsError(err?.message || "Failed to load analytics data");
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, [selectedProject, days]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sentiment", label: "Sentiment" },
    { id: "platforms", label: "Platforms" },
    { id: "engagement", label: "Engagement" },
  ];

  return (
    <AppShell title="Analytics">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(Number(e.target.value))}
          disabled={projectsLoading}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {projectsLoading ? (
            <option>Loading projects...</option>
          ) : projects.length === 0 ? (
            <option>No projects</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))
          )}
        </select>

        <DateRangePicker
          defaultPreset="30d"
          onChange={(range) => setDateRange(range)}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-indigo-400 border-indigo-400"
                : "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {metricsError && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {metricsError}
        </div>
      )}

      {/* Loading */}
      {metricsLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : !selectedProject ? (
        <EmptyState message="Select a project to view analytics" />
      ) : !metrics ? (
        <EmptyState message="No analytics data available for this project" />
      ) : (
        <>
          {activeTab === "overview" && <OverviewTab metrics={metrics} />}
          {activeTab === "sentiment" && <SentimentTab metrics={metrics} />}
          {activeTab === "platforms" && <PlatformsTab metrics={metrics} />}
          {activeTab === "engagement" && <EngagementTab metrics={metrics} />}
        </>
      )}
    </AppShell>
  );
}
