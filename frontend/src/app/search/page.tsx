"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search as SearchIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  MessageCircle,
  ExternalLink,
  Star,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";

// ---------- constants ----------

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1DA1F2",
  instagram: "#E4405F",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  reddit: "#FF4500",
  tiktok: "#010101",
  news: "#6366f1",
  mastodon: "#6364FF",
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
  mastodon: "Mastodon",
};

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  negative: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const PLATFORMS_LIST = ["all", "twitter", "instagram", "facebook", "linkedin", "youtube", "reddit", "tiktok", "news", "mastodon"] as const;
const SENTIMENTS_LIST = ["all", "positive", "negative", "neutral"] as const;

// ---------- types ----------

interface SearchResult {
  id: number;
  platform: string;
  author_name: string;
  author_handle: string;
  author_followers: number;
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  likes: number;
  shares: number;
  comments: number;
  created_at: string;
  source_url: string;
}

interface Project {
  id: number;
  name: string;
}

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
  return `${Math.floor(diffD / 7)}w ago`;
}

function highlightTerm(text: string, term: string): React.ReactNode {
  if (!term.trim()) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-amber-500/25 text-amber-200 rounded px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}

function normalizeResult(raw: any): SearchResult {
  return {
    id: raw.id,
    platform: raw.platform || "other",
    author_name: raw.author_name || raw.author?.name || "Unknown",
    author_handle: raw.author_handle || raw.author?.handle || "",
    author_followers: raw.author_followers || raw.author?.followers || 0,
    text: raw.text || raw.content || "",
    sentiment: raw.sentiment || "neutral",
    likes: raw.likes || 0,
    shares: raw.shares || 0,
    comments: raw.comments || 0,
    created_at: raw.created_at || raw.collected_at || raw.published_at || "",
    source_url: raw.source_url || "",
  };
}

// ---------- main page ----------

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "engagement">("relevance");

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number>(0);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load projects
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getProjects();
        if (cancelled) return;
        const list = (data || []).map((p: any) => ({ id: p.id, name: p.name }));
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0].id);
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const performSearch = useCallback(async (searchQuery?: string, pageNum?: number) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setSubmittedQuery(q);
    setSearchError(null);
    const currentPage = pageNum ?? 1;
    setPage(currentPage);

    try {
      // Try the search endpoint first, fall back to mentions with search param
      let data: any;
      const searchParams = {
        query: q,
        projectId: selectedProject || undefined,
        platform: platformFilter !== "all" ? platformFilter : undefined,
        sentiment: sentimentFilter !== "all" ? sentimentFilter : undefined,
        page: currentPage,
        limit: pageSize,
      };
      try {
        // 6.39 — Use POST to avoid search terms in URL/server logs
        data = await api.search(searchParams);
      } catch (searchErr: any) {
        // Fall back to GET search if POST is not supported (405), or if
        // the search service is unavailable (404/502/503)
        const fallbackCodes = [404, 405, 502, 503];
        if (fallbackCodes.includes(searchErr?.status)) {
          try {
            data = await api.searchGet(searchParams);
          } catch {
            // Final fallback: search via mentions endpoint
            const params: any = { page: currentPage, limit: pageSize, search: q };
            if (platformFilter !== "all") params.platform = platformFilter;
            if (sentimentFilter !== "all") params.sentiment = sentimentFilter;
            data = await api.getMentions(selectedProject || 0, params);
          }
        } else {
          throw searchErr;
        }
      }

      const items = data?.items || data?.results || data || [];
      const total = data?.total ?? items.length;
      setResults(items.map(normalizeResult));
      setTotalResults(total);
    } catch (err: any) {
      console.error("Search failed:", err);
      // 6.5 — Use safeMessage to avoid exposing raw backend errors
      setSearchError(err?.safeMessage || err?.message || "Search failed. Please try again.");
      setResults([]);
      setTotalResults(0);
    } finally {
      setIsSearching(false);
    }
  }, [query, selectedProject, platformFilter, sentimentFilter]);

  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));

  // Client-side sort (the API may not support all sort modes)
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === "engagement") return (b.likes + b.shares + b.comments) - (a.likes + a.shares + a.comments);
    return 0; // relevance = server order
  });

  return (
    <AppShell title="Search">
      {/* Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="relative max-w-3xl mx-auto mb-4">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") performSearch(); }}
              placeholder="Search mentions, authors, topics..."
              className="w-full h-12 rounded-xl border border-slate-700 bg-slate-800 pl-12 pr-28 text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <button
                  onClick={() => { setQuery(""); searchInputRef.current?.focus(); }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => performSearch()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 max-w-3xl mx-auto">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(Number(e.target.value))}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={0}>All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PLATFORMS_LIST.map((p) => (
              <option key={p} value={p}>{p === "all" ? "All Platforms" : PLATFORM_LABELS[p] || p}</option>
            ))}
          </select>

          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SENTIMENTS_LIST.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Sentiment" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="date">Sort: Date</option>
            <option value="engagement">Sort: Engagement</option>
          </select>
        </div>
      </div>

      {/* Main content */}
      {!hasSearched ? (
        /* Landing state */
        <div className="flex flex-col items-center justify-center py-20">
          <SearchIcon className="h-16 w-16 text-slate-700 mb-4" />
          <h2 className="text-xl font-semibold text-slate-300 mb-2">Search across all your collected mentions</h2>
          <p className="text-sm text-slate-500">
            Find conversations, authors, and trends across all monitored platforms
          </p>
        </div>
      ) : (
        <div>
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-slate-200">{totalResults}</span> results
              for &quot;<span className="font-medium text-slate-300">{submittedQuery}</span>&quot;
            </p>
          </div>

          {/* Error state */}
          {searchError && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400">{searchError}</p>
                <p className="text-xs text-red-400/70 mt-1">The search service may be unavailable. Try again later.</p>
              </div>
            </div>
          )}

          {/* Results list */}
          {isSearching ? (
            <div className="flex items-center justify-center h-48">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : sortedResults.length === 0 && !searchError ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
              <Inbox className="h-12 w-12 mb-3 text-slate-600" />
              <p className="text-base font-medium text-slate-400">No results found</p>
              <p className="text-sm mt-1">Try different keywords or adjust filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedResults.map((result) => (
                <div
                  key={result.id}
                  className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Platform icon */}
                    <span
                      className="h-8 w-8 rounded-lg text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[result.platform] || "#64748b" }}
                    >
                      {(PLATFORM_LABELS[result.platform] || result.platform || "?").charAt(0).toUpperCase()}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Author */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-100">{result.author_name}</span>
                        <span className="text-xs text-slate-500">{result.author_handle}</span>
                        {result.author_followers > 10000 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 rounded-full border border-amber-500/30">
                            <Star className="h-2.5 w-2.5" /> Influencer
                          </span>
                        )}
                        <span className="text-xs text-slate-600 ml-auto shrink-0">
                          {relativeTime(result.created_at)}
                        </span>
                      </div>

                      {/* Text with highlighting */}
                      <p className="text-sm text-slate-300 mb-2 leading-relaxed">
                        {highlightTerm(result.text, submittedQuery)}
                      </p>

                      {/* Engagement + sentiment */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border", SENTIMENT_BADGE[result.sentiment] || SENTIMENT_BADGE.neutral)}>
                          {result.sentiment.charAt(0).toUpperCase() + result.sentiment.slice(1)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Heart className="h-3 w-3" /> {formatNumber(result.likes)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Share2 className="h-3 w-3" /> {formatNumber(result.shares)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <MessageCircle className="h-3 w-3" /> {formatNumber(result.comments)}
                        </span>

                        {result.source_url && (
                          <a
                            href={result.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 ml-auto"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalResults > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalResults)} of {totalResults}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { const p = Math.max(1, page - 1); setPage(p); performSearch(submittedQuery, p); }}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) { p = i + 1; }
                  else if (page <= 3) { p = i + 1; }
                  else if (page >= totalPages - 2) { p = totalPages - 4 + i; }
                  else { p = page - 2 + i; }
                  return (
                    <button
                      key={p}
                      onClick={() => { setPage(p); performSearch(submittedQuery, p); }}
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
                  onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); performSearch(submittedQuery, p); }}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
