"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Flag,
  Heart,
  Share2,
  MessageCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  CheckSquare,
  Eye,
  Bot,
  Star,
  Image as ImageIcon,
  Globe,
  Clock,
} from "lucide-react";
import { cn, formatNumber, truncate } from "@/lib/utils";
import { useMentions, type Mention, type MentionFilters } from "@/hooks/useMentions";

// ---------- helpers ----------

const PLATFORMS = ["all", "twitter", "instagram", "facebook", "linkedin", "youtube", "reddit", "tiktok", "news"] as const;
const SENTIMENTS = ["all", "positive", "negative", "neutral"] as const;
const LANGUAGES = [
  { value: "all", label: "All Languages" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
];

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-sky-500",
  instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
  facebook: "bg-blue-600",
  linkedin: "bg-blue-700",
  youtube: "bg-red-600",
  reddit: "bg-orange-500",
  tiktok: "bg-gray-900",
  news: "bg-emerald-600",
};

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  tiktok: "TikTok",
  news: "News",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-800 border-emerald-200",
  negative: "bg-red-100 text-red-800 border-red-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

function relativeTime(dateStr: string): string {
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
  const s = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <span
      className={cn(
        s,
        "inline-flex items-center justify-center rounded-md text-white text-[10px] font-bold shrink-0",
        PLATFORM_COLORS[platform] || "bg-gray-500"
      )}
    >
      {(PLATFORM_LABELS[platform] || platform)[0].toUpperCase()}
    </span>
  );
}

function AuthorAvatar({ name }: { name: string }) {
  const colors = [
    "bg-indigo-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-lime-600",
  ];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <span
      className={cn(
        "h-9 w-9 rounded-full inline-flex items-center justify-center text-white text-sm font-semibold shrink-0",
        colors[idx]
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// ---------- main page ----------

export default function MentionsPage() {
  const [filters, setFilterState] = useState<MentionFilters>({});
  const {
    mentions,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    setFilters,
    isLoading,
    toggleFlag,
  } = useMentions(1, filters);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeMention, setActiveMention] = useState<Mention | null>(null);
  const [searchInput, setSearchInput] = useState("");

  // filter state
  const [platform, setPlatform] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [language, setLanguage] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function applyFilters(overrides?: Partial<MentionFilters>) {
    const f: MentionFilters = {
      platform: overrides?.platform ?? platform,
      sentiment: overrides?.sentiment ?? sentiment,
      language: overrides?.language ?? language,
      dateFrom: overrides?.dateFrom ?? dateFrom,
      dateTo: overrides?.dateTo ?? dateTo,
      search: overrides?.search ?? searchInput,
    };
    setFilterState(f);
    setFilters(f);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const allSelected = mentions.length > 0 && mentions.every((m) => selectedIds.has(m.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mentions.map((m) => m.id)));
    }
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
    <div className="min-h-screen bg-gray-50">
      {/* Top bar / filters */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Mentions</h1>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                applyFilters({ platform: e.target.value });
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All Platforms" : PLATFORM_LABELS[p] || p}
                </option>
              ))}
            </select>

            <select
              value={sentiment}
              onChange={(e) => {
                setSentiment(e.target.value);
                applyFilters({ sentiment: e.target.value });
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SENTIMENTS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Sentiment" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                applyFilters({ language: e.target.value });
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                applyFilters({ dateFrom: e.target.value });
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                applyFilters({ dateTo: e.target.value });
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="To"
            />

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters({ search: searchInput })}
                placeholder="Search mentions..."
                className="w-full h-9 rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mt-2 px-2 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <span className="text-sm font-medium text-indigo-700">
                {selectedIds.size} selected
              </span>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                <Flag className="h-3.5 w-3.5" /> Flag selected
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                <Download className="h-3.5 w-3.5" /> Export selected
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                <Eye className="h-3.5 w-3.5" /> Mark as reviewed
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content: list + detail */}
      <div className="max-w-[1800px] mx-auto flex">
        {/* Left panel - mention list */}
        <div
          className={cn(
            "border-r border-gray-200 bg-white overflow-y-auto",
            activeMention ? "w-full lg:w-[60%]" : "w-full"
          )}
          style={{ height: "calc(100vh - 160px)" }}
        >
          {/* Select all */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-500">Select all on page</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : mentions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Search className="h-12 w-12 mb-3" />
              <p className="text-lg font-medium">No mentions found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mentions.map((mention) => (
                <li
                  key={mention.id}
                  onClick={() => setActiveMention(mention)}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors",
                    activeMention?.id === mention.id && "bg-indigo-50 border-l-2 border-indigo-500"
                  )}
                >
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(mention.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(mention.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <PlatformIcon platform={mention.platform} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AuthorAvatar name={mention.author.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {mention.author.name}
                          </span>
                          <span className="text-xs text-gray-400 truncate">
                            {mention.author.handle}
                          </span>
                          {mention.author.followers > 10000 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                              <Star className="h-2.5 w-2.5" /> Influencer
                            </span>
                          )}
                          {mention.author.is_bot && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full border border-red-200">
                              <Bot className="h-2.5 w-2.5" /> Bot
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-gray-700 line-clamp-2 mb-2">{mention.text}</p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border",
                          SENTIMENT_COLORS[mention.sentiment]
                        )}
                      >
                        {mention.sentiment.charAt(0).toUpperCase() + mention.sentiment.slice(1)}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Heart className="h-3 w-3" /> {formatNumber(mention.likes)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Share2 className="h-3 w-3" /> {formatNumber(mention.shares)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <MessageCircle className="h-3 w-3" /> {formatNumber(mention.comments)}
                      </span>

                      {mention.keywords.slice(0, 3).map((kw) => (
                        <span
                          key={kw}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {relativeTime(mention.created_at)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlag(mention.id);
                      }}
                      className={cn(
                        "p-1 rounded hover:bg-gray-100 transition-colors",
                        mention.is_flagged ? "text-red-500" : "text-gray-300 hover:text-gray-500"
                      )}
                    >
                      <Flag className="h-4 w-4" fill={mention.is_flagged ? "currentColor" : "none"} />
                    </button>
                    {mention.has_media && <ImageIcon className="h-3.5 w-3.5 text-gray-300" />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                Showing {startItem}-{endItem} of {total} mentions
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700"
              >
                {[25, 50, 100].map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "h-8 w-8 rounded text-sm font-medium",
                      p === page
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right panel - mention detail */}
        {activeMention && (
          <div
            className="hidden lg:block w-[40%] overflow-y-auto bg-white"
            style={{ height: "calc(100vh - 160px)" }}
          >
            <MentionDetail
              mention={activeMention}
              onClose={() => setActiveMention(null)}
              onFlag={() => toggleFlag(activeMention.id)}
            />
          </div>
        )}
      </div>

      {/* Mobile detail overlay */}
      {activeMention && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
          <MentionDetail
            mention={activeMention}
            onClose={() => setActiveMention(null)}
            onFlag={() => toggleFlag(activeMention.id)}
          />
        </div>
      )}
    </div>
  );
}

// ---------- detail panel ----------

function MentionDetail({
  mention,
  onClose,
  onFlag,
}: {
  mention: Mention;
  onClose: () => void;
  onFlag: () => void;
}) {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <AuthorAvatar name={mention.author.name} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{mention.author.name}</span>
              {mention.author.is_bot && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full border border-red-200">
                  <Bot className="h-2.5 w-2.5" /> Bot
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{mention.author.handle}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Full text */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
        <p className="text-sm text-gray-800 leading-relaxed">{mention.text}</p>
      </div>

      {/* Author details */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-gray-900">{formatNumber(mention.author.followers)}</p>
          <p className="text-xs text-gray-500">Followers</p>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-gray-900">{mention.author.influence_score}</p>
          <p className="text-xs text-gray-500">Influence Score</p>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-gray-900">{formatNumber(mention.reach)}</p>
          <p className="text-xs text-gray-500">Reach</p>
        </div>
      </div>

      {/* Platform + source */}
      <div className="flex items-center gap-2 mb-4">
        <PlatformIcon platform={mention.platform} size="md" />
        <span className="text-sm font-medium text-gray-700">
          {PLATFORM_LABELS[mention.platform] || mention.platform}
        </span>
        <a
          href={mention.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 ml-auto"
        >
          View original <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Engagement */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Engagement
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 p-2.5 bg-pink-50 rounded-lg">
            <Heart className="h-4 w-4 text-pink-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{formatNumber(mention.likes)}</p>
              <p className="text-[10px] text-gray-500">Likes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
            <Share2 className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{formatNumber(mention.shares)}</p>
              <p className="text-[10px] text-gray-500">Shares</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-violet-50 rounded-lg">
            <MessageCircle className="h-4 w-4 text-violet-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {formatNumber(mention.comments)}
              </p>
              <p className="text-[10px] text-gray-500">Comments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sentiment */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Sentiment Analysis
        </h3>
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <span
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-full border",
              SENTIMENT_COLORS[mention.sentiment]
            )}
          >
            {mention.sentiment.charAt(0).toUpperCase() + mention.sentiment.slice(1)}
          </span>
          <div className="text-sm text-gray-600">
            Score: <span className="font-medium">{mention.sentiment_score.toFixed(2)}</span>
          </div>
          <div className="text-sm text-gray-600">
            Confidence:{" "}
            <span className="font-medium">{(mention.sentiment_confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Matched Keywords
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {mention.keywords.map((kw) => (
            <span
              key={kw}
              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Topics */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Topics
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {mention.topics.map((t) => (
            <span
              key={t}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Media */}
      {mention.has_media && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Media
          </h3>
          <div className="h-40 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400">
            <ImageIcon className="h-8 w-8 mr-2" />
            <span className="text-sm">Media preview</span>
          </div>
        </div>
      )}

      {/* Language + time */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-6">
        <span className="inline-flex items-center gap-1">
          <Globe className="h-3.5 w-3.5" /> {mention.language.toUpperCase()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {new Date(mention.created_at).toLocaleString()}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-gray-200 pt-4 mb-6">
        <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          <MessageCircle className="h-4 w-4" /> Reply
        </button>
        <button
          onClick={onFlag}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors",
            mention.is_flagged
              ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          )}
        >
          <Flag className="h-4 w-4" fill={mention.is_flagged ? "currentColor" : "none"} />
          {mention.is_flagged ? "Flagged" : "Flag"}
        </button>
        <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* Related mentions */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Related Mentions
        </h3>
        <div className="space-y-2">
          {["Similar mention about NovaBrand skincare...", "Another user discussed NovaBrand pricing...", "Related thread on product quality..."].map(
            (text, i) => (
              <div
                key={i}
                className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                {text}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
