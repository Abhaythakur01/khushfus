"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import {
  Search,
  Flag,
  Heart,
  Share2,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Bot,
  Star,
  Inbox,
  Image as ImageIcon,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { useMentions, type Mention, type MentionFilters } from "@/hooks/useMentions";
import { AppShell } from "@/components/layout/AppShell";

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ---------- lazy-loaded detail panel (6.29 — code splitting) ----------

const LazyMentionDetail = dynamic(
  () => import("./MentionDetail"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    ),
  }
);

// ---------- constants (shared) ----------

import {
  PLATFORMS,
  SENTIMENTS,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  SENTIMENT_BADGE,
} from "@/lib/constants";

// ---------- helpers ----------

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  const diffW = Math.floor(diffD / 7);
  return `${diffW}w ago`;
}

function PlatformIcon({ platform, size = "sm" }: { platform: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  const color = PLATFORM_COLORS[platform] || "#64748b";
  return (
    <span
      className={cn(s, "inline-flex items-center justify-center rounded-md text-white font-bold shrink-0")}
      style={{ backgroundColor: color }}
    >
      {(PLATFORM_LABELS[platform] || platform || "?")[0].toUpperCase()}
    </span>
  );
}

function AuthorAvatar({ name }: { name: string }) {
  const colors = [
    "bg-indigo-600", "bg-pink-600", "bg-teal-600", "bg-amber-600",
    "bg-violet-600", "bg-cyan-600", "bg-rose-600", "bg-lime-600",
  ];
  const idx = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <span className={cn("h-9 w-9 rounded-full inline-flex items-center justify-center text-white text-sm font-semibold shrink-0", colors[idx])}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

// ---------- main page ----------

interface Project {
  id: number;
  name: string;
}

export default function MentionsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number>(0);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Load projects
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await api.getProjects(controller.signal);
        if (controller.signal.aborted) return;
        const list = (data || []).map((p: any) => ({ id: p.id, name: p.name }));
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0].id);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load projects:", err);
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  const [filters, setFilterState] = useState<MentionFilters>({});
  const {
    mentions, total, page, pageSize,
    setPage, setPageSize, setFilters,
    isLoading, error, toggleFlag,
  } = useMentions(selectedProject, filters);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeMention, setActiveMention] = useState<Mention | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 400);

  const [platform, setPlatform] = useState("all");
  const [sentiment, setSentiment] = useState("all");

  const applyFilters = useCallback((overrides?: Partial<MentionFilters>) => {
    const f: MentionFilters = {
      platform: overrides?.platform ?? platform,
      sentiment: overrides?.sentiment ?? sentiment,
      search: overrides?.search ?? searchInput,
    };
    setFilterState(f);
    setFilters(f);
  }, [platform, sentiment, searchInput, setFilters]);

  // Auto-apply search filter after debounce
  useEffect(() => {
    applyFilters({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleSentimentOverride = async (mentionId: number, newSentiment: string) => {
    try {
      await api.updateMentionSentiment(mentionId, newSentiment);
      if (activeMention?.id === mentionId) {
        setActiveMention({ ...activeMention, sentiment: newSentiment as any, sentiment_score: newSentiment === 'positive' ? 0.8 : newSentiment === 'negative' ? -0.8 : 0 });
      }
      toast.success(`Sentiment updated to ${newSentiment}`);
    } catch (err) {
      console.error("Failed to update sentiment:", err);
      toast.error("Failed to update sentiment");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const allSelected = mentions.length > 0 && mentions.every((m) => selectedIds.has(m.id));

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(mentions.map((m) => m.id)));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell title="Mentions">
      {/* Project selector + Filter bar */}
      <div className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 rounded-t-xl -mx-4 -mt-4 lg:-mx-6 lg:-mt-6 px-4 lg:px-6 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(Number(e.target.value));
              setPage(1);
            }}
            disabled={projectsLoading}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

          <select
            value={platform}
            onChange={(e) => { setPlatform(e.target.value); applyFilters({ platform: e.target.value }); }}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p === "all" ? "All Platforms" : PLATFORM_LABELS[p] || p}</option>
            ))}
          </select>

          <select
            value={sentiment}
            onChange={(e) => { setSentiment(e.target.value); applyFilters({ sentiment: e.target.value }); }}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Sentiment" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mentions..."
              className="w-full h-9 rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-indigo-600/10 rounded-lg border border-indigo-500/30">
            <span className="text-sm font-medium text-indigo-400">{selectedIds.size} selected</span>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300">
              <Flag className="h-3.5 w-3.5" /> Flag
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Clear</button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => applyFilters()}
            className="ml-3 px-3 py-1 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content: list + detail */}
      <div className="flex rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 h-[calc(100vh-theme(spacing.16)-theme(spacing.8)-200px)] min-h-[400px]">
        {/* Left panel */}
        <div
          className={cn(
            "border-r border-slate-800 overflow-y-auto flex-1 min-h-0",
            activeMention ? "w-full lg:w-[58%]" : "w-full"
          )}
        >
          {/* Select all header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
            />
            <span className="text-xs text-slate-500">Select all</span>
            <span className="text-xs text-slate-600 ml-auto">
              {total > 0 ? `${startItem}-${endItem} of ${total}` : "0 mentions"}
            </span>
          </div>

          {/* Loading overlay when refetching with existing data */}
          {isLoading && mentions.length > 0 && (
            <div className="flex items-center justify-center py-2 bg-indigo-600/5 border-b border-slate-800">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mr-2" />
              <span className="text-xs text-slate-400">Updating...</span>
            </div>
          )}

          {isLoading && mentions.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : !selectedProject ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Inbox className="h-12 w-12 mb-3 text-slate-600" />
              <p className="text-base font-medium text-slate-400">No project selected</p>
              <p className="text-sm mt-1">Select a project to view mentions</p>
            </div>
          ) : mentions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Inbox className="h-12 w-12 mb-3 text-slate-600" />
              <p className="text-base font-medium text-slate-400">No mentions yet</p>
              <p className="text-sm mt-1">Create a project and add keywords to start collecting.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {mentions.map((mention) => (
                <li
                  key={mention.id}
                  onClick={() => setActiveMention(mention)}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer transition-colors",
                    activeMention?.id === mention.id
                      ? "bg-indigo-600/10 border-l-2 border-indigo-500"
                      : "hover:bg-slate-800/50"
                  )}
                >
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(mention.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(mention.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <PlatformIcon platform={mention.platform} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AuthorAvatar name={mention.author.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-100 truncate">{mention.author.name}</span>
                          <span className="text-xs text-slate-500 truncate">{mention.author.handle}</span>
                          {mention.author.followers > 10000 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 rounded-full border border-amber-500/30">
                              <Star className="h-2.5 w-2.5" /> Influencer
                            </span>
                          )}
                          {mention.author.is_bot && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 rounded-full border border-red-500/30">
                              <Bot className="h-2.5 w-2.5" /> Bot
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/*
                      6.4 — Mention text is rendered as a JSX text node, NOT via
                      dangerouslySetInnerHTML. React auto-escapes all text content,
                      so any HTML/script tags in mention.text are rendered as
                      literal strings and cannot execute. This is safe by default.
                    */}
                    <p className="text-sm text-slate-300 line-clamp-2 mb-2">{mention.text}</p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border", SENTIMENT_BADGE[mention.sentiment] || SENTIMENT_BADGE.neutral)}>
                        {mention.sentiment.charAt(0).toUpperCase() + mention.sentiment.slice(1)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Heart className="h-3 w-3" /> {formatNumber(mention.likes)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Share2 className="h-3 w-3" /> {formatNumber(mention.shares)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <MessageCircle className="h-3 w-3" /> {formatNumber(mention.comments)}
                      </span>
                      {mention.keywords.slice(0, 3).map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded">{kw}</span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{relativeTime(mention.created_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFlag(mention.id); }}
                      aria-label={mention.is_flagged ? "Unflag mention" : "Flag mention"}
                      className={cn("p-1 rounded hover:bg-slate-700 transition-colors", mention.is_flagged ? "text-red-400" : "text-slate-600 hover:text-slate-400")}
                    >
                      <Flag className="h-4 w-4" fill={mention.is_flagged ? "currentColor" : "none"} />
                    </button>
                    {mention.has_media && <ImageIcon className="h-3.5 w-3.5 text-slate-600" />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  {startItem}-{endItem} of {total}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300"
                >
                  {[25, 50, 100].map((s) => (
                    <option key={s} value={s}>{s} / page</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        "h-8 w-8 rounded text-sm font-medium",
                        p === page ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - detail */}
        {activeMention && (
          <div
            className="hidden lg:block w-[42%] overflow-y-auto bg-slate-950/50 min-h-0"
          >
            <LazyMentionDetail
              mention={activeMention}
              onClose={() => setActiveMention(null)}
              onFlag={() => toggleFlag(activeMention.id)}
              onSentimentOverride={(sentiment: string) => handleSentimentOverride(activeMention.id, sentiment)}
            />
          </div>
        )}
      </div>

      {/* Mobile detail overlay */}
      {activeMention && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950 overflow-y-auto">
          <LazyMentionDetail
            mention={activeMention}
            onClose={() => setActiveMention(null)}
            onFlag={() => toggleFlag(activeMention.id)}
            onSentimentOverride={(sentiment: string) => handleSentimentOverride(activeMention.id, sentiment)}
          />
        </div>
      )}
    </AppShell>
  );
}

