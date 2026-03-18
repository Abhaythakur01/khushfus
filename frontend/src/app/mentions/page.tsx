"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Tag,
  ChevronDown,
  X,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { useMentions, type Mention, type MentionFilters } from "@/hooks/useMentions";
import { AppShell } from "@/components/layout/AppShell";
import { DateRangePicker, type DateRange } from "@/components/ui/daterange";
import { collectAllUsedTags, loadAllTags, TAG_CATEGORIES } from "./MentionDetail";

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ---------- tag filter dropdown ----------

function TagFilterDropdown({
  selectedTags,
  onChange,
}: {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh tag pool when dropdown opens
  useEffect(() => {
    if (open) setAllTags(collectAllUsedTags());
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(tag: string) {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  }

  function getTagStyle(tag: string) {
    const lower = tag.toLowerCase();
    if (TAG_CATEGORIES[lower]) return TAG_CATEGORIES[lower];
    const match = Object.keys(TAG_CATEGORIES).find((k) => lower.includes(k) || k.includes(lower));
    return match ? TAG_CATEGORIES[match] : { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/30" };
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg border transition-colors",
          selectedTags.length > 0
            ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
            : "border-white/[0.08] bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] hover:text-slate-100",
        )}
      >
        <Tag className="h-3.5 w-3.5" />
        Tags
        {selectedTags.length > 0 && (
          <span className="inline-flex items-center justify-center h-4 w-4 text-[10px] font-bold bg-indigo-500 text-white rounded-full">
            {selectedTags.length}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-40 w-52 bg-[#141925] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Filter by tag</span>
            {selectedTags.length > 0 && (
              <button onClick={() => onChange([])} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                Clear all
              </button>
            )}
          </div>
          {allTags.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No tags applied to any mention yet.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto py-1">
              {allTags.map((tag) => {
                const style = getTagStyle(tag);
                const checked = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggle(tag)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-white/[0.05] transition-colors text-left",
                      checked && "bg-indigo-500/[0.08]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0",
                        checked ? "bg-indigo-600 border-indigo-500" : "border-slate-600",
                      )}
                    >
                      {checked && <X className="h-2 w-2 text-white" />}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded-full border",
                        style.bg, style.text, style.border,
                      )}
                    >
                      {tag}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const label = PLATFORM_LABELS[platform] || platform || "Unknown";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(s, "inline-flex items-center justify-center rounded-md text-white font-bold shrink-0")}
      style={{ backgroundColor: color }}
    >
      <span aria-hidden="true">{label[0].toUpperCase()}</span>
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

// ---------- CSV export ----------

function escapeCSV(value: string): string {
  if (!value) return "";
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape inner quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportMentionsToCSV(mentions: Mention[]): void {
  const headers = ["Platform", "Author", "Content", "Sentiment", "Likes", "Shares", "Comments", "Date"];
  const rows = mentions.map((m) => [
    escapeCSV(m.platform),
    escapeCSV(m.author.name),
    escapeCSV(m.text),
    escapeCSV(m.sentiment),
    String(m.likes),
    String(m.shares),
    String(m.comments),
    escapeCSV(m.created_at),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mentions-export-${dateStr}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${mentions.length} mentions`);
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
  const [isBulkFlagging, setIsBulkFlagging] = useState(false);
  const [activeMention, setActiveMention] = useState<Mention | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 400);

  const [platform, setPlatform] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const applyFilters = useCallback((overrides?: Partial<MentionFilters>) => {
    const f: MentionFilters = {
      platform: overrides?.platform ?? platform,
      sentiment: overrides?.sentiment ?? sentiment,
      search: overrides?.search ?? searchInput,
      dateFrom: overrides?.dateFrom ?? (dateRange?.startDate || undefined),
      dateTo: overrides?.dateTo ?? (dateRange?.endDate || undefined),
    };
    setFilterState(f);
    setFilters(f);
  }, [platform, sentiment, searchInput, dateRange, setFilters]);

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

  // Client-side tag filter (tags are stored locally, not on server)
  const allMentionTags = loadAllTags();
  const filteredMentions = selectedTags.length === 0
    ? mentions
    : mentions.filter((m) => {
        const mTags = allMentionTags[m.id] ?? [];
        return selectedTags.every((t) => mTags.includes(t));
      });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const allSelected = filteredMentions.length > 0 && filteredMentions.every((m) => selectedIds.has(m.id));

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredMentions.map((m) => m.id)));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkFlag() {
    if (selectedIds.size === 0) return;
    setIsBulkFlagging(true);
    try {
      await api.bulkFlagMentions(Array.from(selectedIds), true);
      toast.success(`Flagged ${selectedIds.size} mention${selectedIds.size !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      applyFilters();
    } catch (err) {
      console.error("Bulk flag failed:", err);
      toast.error("Failed to flag mentions");
    } finally {
      setIsBulkFlagging(false);
    }
  }

  return (
    <AppShell title="Mentions">
      {/* Project selector + Filter bar */}
      <div className="sticky top-0 z-30 bg-[#111827]/70 backdrop-blur-sm border-b border-white/[0.06] rounded-t-xl -mx-4 -mt-4 lg:-mx-6 lg:-mt-6 px-4 lg:px-6 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(Number(e.target.value));
              setPage(1);
            }}
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

          <select
            value={platform}
            onChange={(e) => { setPlatform(e.target.value); applyFilters({ platform: e.target.value }); }}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p === "all" ? "All Platforms" : PLATFORM_LABELS[p] || p}</option>
            ))}
          </select>

          <select
            value={sentiment}
            onChange={(e) => { setSentiment(e.target.value); applyFilters({ sentiment: e.target.value }); }}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Sentiment" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <DateRangePicker
            defaultPreset="30d"
            onChange={(range) => {
              setDateRange(range);
              applyFilters({ dateFrom: range.startDate, dateTo: range.endDate });
            }}
          />

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mentions..."
              className="w-full h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <TagFilterDropdown selectedTags={selectedTags} onChange={setSelectedTags} />

          <button
            onClick={() => exportMentionsToCSV(mentions)}
            disabled={mentions.length === 0}
            title={mentions.length === 0 ? "No mentions to export" : `Export ${mentions.length} mentions as CSV`}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg border border-white/[0.08] bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] hover:text-slate-100 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-indigo-600/10 rounded-lg border border-indigo-500/30">
            <span className="text-sm font-medium text-indigo-400">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkFlag}
              disabled={isBulkFlagging}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.06] border border-white/[0.08] rounded-md hover:bg-white/[0.04] text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Flag className="h-3.5 w-3.5" />
              {isBulkFlagging ? "Flagging..." : "Flag"}
            </button>
            <button
              onClick={() => {
                const selected = mentions.filter((m) => selectedIds.has(m.id));
                if (selected.length > 0) exportMentionsToCSV(selected);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.06] border border-white/[0.08] rounded-md hover:bg-white/[0.04] text-slate-300"
            >
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
      <div className="flex rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.03] h-[calc(100vh-theme(spacing.16)-theme(spacing.8)-200px)] min-h-[400px]">
        {/* Left panel */}
        <div
          className={cn(
            "border-r border-white/[0.06] overflow-y-auto flex-1 min-h-0",
            activeMention ? "w-full lg:w-[58%]" : "w-full"
          )}
        >
          {/* Select all header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-[#111827]/70">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-600 bg-white/[0.06] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
            />
            <span className="text-xs text-slate-500">Select all</span>
            <span className="text-xs text-slate-600 ml-auto">
              {total > 0 ? `${startItem}-${endItem} of ${total}` : "0 mentions"}
            </span>
          </div>

          {/* Loading overlay when refetching with existing data */}
          {isLoading && filteredMentions.length > 0 && (
            <div role="status" aria-live="polite" className="flex items-center justify-center py-2 bg-indigo-600/5 border-b border-white/[0.06]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mr-2" aria-hidden="true" />
              <span className="text-xs text-slate-400">Updating...</span>
            </div>
          )}

          {isLoading && filteredMentions.length === 0 ? (
            <div className="flex items-center justify-center h-64" role="status" aria-label="Loading mentions">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" aria-hidden="true" />
            </div>
          ) : !selectedProject ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Inbox className="h-12 w-12 mb-3 text-slate-600" aria-hidden="true" />
              <p className="text-base font-medium text-slate-400">No project selected</p>
              <p className="text-sm mt-1">Select a project to view mentions</p>
            </div>
          ) : filteredMentions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Inbox className="h-12 w-12 mb-3 text-slate-600" aria-hidden="true" />
              <p className="text-base font-medium text-slate-400">
                {selectedTags.length > 0 ? "No mentions match the selected tags" : "No mentions yet"}
              </p>
              <p className="text-sm mt-1">
                {selectedTags.length > 0
                  ? "Try adjusting or clearing the tag filter."
                  : "Create a project and add keywords to start collecting."}
              </p>
            </div>
          ) : (
            <ul aria-live="polite" aria-label={`${filteredMentions.length} mentions`} className="divide-y divide-white/[0.04]">
              {filteredMentions.map((mention) => (
                <li
                  key={mention.id}
                  onClick={() => setActiveMention(mention)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveMention(mention); } }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={activeMention?.id === mention.id}
                  aria-label={`Mention by ${mention.author.name} — ${mention.sentiment} sentiment`}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500",
                    activeMention?.id === mention.id
                      ? "bg-indigo-600/10 border-l-2 border-indigo-500"
                      : "hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(mention.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(mention.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-600 bg-white/[0.06] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
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
                        <span key={kw} className="px-1.5 py-0.5 text-[10px] bg-white/[0.06] text-slate-400 rounded">{kw}</span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{relativeTime(mention.created_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFlag(mention.id); }}
                      aria-label={mention.is_flagged ? "Unflag mention" : "Flag mention"}
                      className={cn("p-1 rounded hover:bg-white/[0.04] transition-colors", mention.is_flagged ? "text-red-400" : "text-slate-600 hover:text-slate-400")}
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
            <div className="sticky bottom-0 bg-[#111827]/70 border-t border-white/[0.06] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  {startItem}-{endItem} of {total}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded border border-white/[0.08] bg-white/[0.06] px-2 text-xs text-slate-300"
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
                  className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        p === page ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/[0.06]"
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
                  className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="hidden lg:block w-[42%] overflow-y-auto bg-[#0a0f1a]/50 min-h-0"
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
        <div className="lg:hidden fixed inset-0 z-50 bg-[#0a0f1a] overflow-y-auto">
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

