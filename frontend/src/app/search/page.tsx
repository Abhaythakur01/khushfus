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
  Bookmark,
  BookmarkCheck,
  Trash2,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import { Dialog, DialogHeader, DialogContent, DialogFooter } from "@/components/ui/dialog";

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

const SAVED_SEARCHES_KEY = "khushfus_saved_searches";

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

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  platform: string;
  sentiment: string;
  sortBy: "relevance" | "date" | "engagement";
  savedAt: string;
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
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const splitRegex = new RegExp(`(${escaped})`, "gi");
  const testRegex = new RegExp(`^${escaped}$`, "i");
  const parts = text.split(splitRegex);
  return parts.map((part, i) =>
    testRegex.test(part) ? (
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

function loadSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch[]) : [];
  } catch {
    return [];
  }
}

function persistSavedSearches(searches: SavedSearch[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
}

// ---------- useDebounce ----------

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ---------- AutocompleteDropdown ----------

interface AutocompleteDropdownProps {
  suggestions: string[];
  activeIdx: number;
  onSelect: (s: string) => void;
  visible: boolean;
}

function AutocompleteDropdown({ suggestions, activeIdx, onSelect, visible }: AutocompleteDropdownProps) {
  if (!visible || suggestions.length === 0) return null;
  return (
    <ul
      role="listbox"
      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.08] bg-[#141925] shadow-2xl overflow-hidden"
    >
      {suggestions.map((s, i) => (
        <li
          key={s}
          role="option"
          aria-selected={i === activeIdx}
          onMouseDown={(e) => {
            // Use onMouseDown so blur doesn't fire before click
            e.preventDefault();
            onSelect(s);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors",
            i === activeIdx
              ? "bg-indigo-600/20 text-indigo-300"
              : "text-slate-300 hover:bg-white/[0.06]"
          )}
        >
          <SearchIcon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
          {s}
        </li>
      ))}
    </ul>
  );
}

// ---------- SavedSearchChip ----------

interface SavedSearchChipProps {
  search: SavedSearch;
  onRestore: (s: SavedSearch) => void;
  onDelete: (id: string) => void;
}

function SavedSearchChip({ search, onRestore, onDelete }: SavedSearchChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] text-sm text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-600/10 transition-all group">
      <button
        onClick={() => onRestore(search)}
        className="truncate max-w-[160px] text-sm leading-none focus:outline-none"
        title={`Restore: ${search.query}${search.platform !== "all" ? ` · ${search.platform}` : ""}${search.sentiment !== "all" ? ` · ${search.sentiment}` : ""}`}
      >
        {search.name}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(search.id); }}
        aria-label={`Delete saved search "${search.name}"`}
        className="p-0.5 rounded-full text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ---------- SaveSearchDialog ----------

interface SaveSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

function SaveSearchDialog({ open, onClose, onSave }: SaveSearchDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>Save Search</DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <label className="block text-sm text-slate-400 mb-1.5" htmlFor="saved-search-name">
            Name for this search
          </label>
          <input
            ref={inputRef}
            id="saved-search-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Brand mentions last 7d"
            maxLength={80}
            className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </DialogContent>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  );
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
  const { projects } = useProjects();
  const [selectedProject, setSelectedProject] = useState<number>(0);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].id);
    }
  }, [projects, selectedProject]);

  // -----------------------------------------------------------------------
  // Autocomplete (P1 Item 10)
  // -----------------------------------------------------------------------

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const debouncedQuery = useDebounce(query, 300);
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Cancel previous request
    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    api
      .getSuggestions(q, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(data) ? data.slice(0, 8) : [];
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
        setActiveSuggestionIdx(-1);
      })
      .catch(() => {
        /* Silently fail — autocomplete is non-critical */
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  function selectSuggestion(s: string) {
    setQuery(s);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIdx(-1);
    // Trigger immediate search
    performSearchWith(s);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        setActiveSuggestionIdx(-1);
        return;
      }
      if (e.key === "Enter") {
        if (activeSuggestionIdx >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[activeSuggestionIdx]);
          return;
        }
      }
    }
    if (e.key === "Enter") {
      setShowSuggestions(false);
      performSearch();
    }
  }

  // -----------------------------------------------------------------------
  // Saved Searches (P1 Item 11)
  // -----------------------------------------------------------------------

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    setSavedSearches(loadSavedSearches());
  }, []);

  function handleSaveSearch(name: string) {
    const newSearch: SavedSearch = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      name,
      query: query.trim() || submittedQuery,
      platform: platformFilter,
      sentiment: sentimentFilter,
      sortBy,
      savedAt: new Date().toISOString(),
    };
    const updated = [newSearch, ...savedSearches].slice(0, 20); // cap at 20
    setSavedSearches(updated);
    persistSavedSearches(updated);
  }

  function handleDeleteSavedSearch(id: string) {
    const updated = savedSearches.filter((s) => s.id !== id);
    setSavedSearches(updated);
    persistSavedSearches(updated);
  }

  function handleRestoreSavedSearch(saved: SavedSearch) {
    setQuery(saved.query);
    setPlatformFilter(saved.platform);
    setSentimentFilter(saved.sentiment);
    setSortBy(saved.sortBy);
    setShowSuggestions(false);
    performSearchWith(saved.query, saved.platform, saved.sentiment);
  }

  // -----------------------------------------------------------------------
  // Search logic
  // -----------------------------------------------------------------------

  const performSearchWith = useCallback(
    async (
      searchQuery: string,
      platform?: string,
      sentiment?: string,
      pageNum?: number
    ) => {
      const q = searchQuery.trim();
      if (!q) return;

      setIsSearching(true);
      setHasSearched(true);
      setSubmittedQuery(q);
      setSearchError(null);
      const currentPage = pageNum ?? 1;
      setPage(currentPage);

      const pf = platform ?? platformFilter;
      const sf = sentiment ?? sentimentFilter;

      try {
        let data: any;
        const searchParams = {
          query: q,
          projectId: selectedProject || undefined,
          platform: pf !== "all" ? pf : undefined,
          sentiment: sf !== "all" ? sf : undefined,
          page: currentPage,
          limit: pageSize,
        };
        try {
          data = await api.search(searchParams);
        } catch (searchErr: any) {
          const fallbackCodes = [404, 405, 502, 503];
          if (fallbackCodes.includes(searchErr?.status)) {
            try {
              data = await api.searchGet(searchParams);
            } catch {
              const params: any = { page: currentPage, limit: pageSize, search: q };
              if (pf !== "all") params.platform = pf;
              if (sf !== "all") params.sentiment = sf;
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
        setSearchError(err?.safeMessage || err?.message || "Search failed. Please try again.");
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedProject, platformFilter, sentimentFilter, pageSize]
  );

  const performSearch = useCallback(
    (searchQuery?: string, pageNum?: number) => {
      return performSearchWith(
        searchQuery ?? query,
        platformFilter,
        sentimentFilter,
        pageNum
      );
    },
    [query, platformFilter, sentimentFilter, performSearchWith]
  );

  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));

  // Client-side sort
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === "engagement") return (b.likes + b.shares + b.comments) - (a.likes + a.shares + a.comments);
    return 0;
  });

  return (
    <AppShell title="Search">
      {/* Save Search Dialog */}
      <SaveSearchDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSaveSearch}
      />

      {/* Search Bar */}
      <div className="glass-card rounded-xl p-6 mb-6">
        <div className="relative max-w-3xl mx-auto mb-4">
          {/* Search input + autocomplete */}
          <div className="relative">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none z-10" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.length >= 2) setShowSuggestions(true);
                  else { setShowSuggestions(false); setSuggestions([]); }
                }}
                onKeyDown={handleInputKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                onBlur={() => {
                  // Delay so onMouseDown on suggestion fires first
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                placeholder="Search mentions, authors, topics..."
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                aria-haspopup="listbox"
                className="w-full h-12 rounded-xl border border-white/[0.08] bg-white/[0.06] pl-12 pr-40 text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setSuggestions([]);
                      setShowSuggestions(false);
                      searchInputRef.current?.focus();
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.08]"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {/* Save search button */}
                <button
                  onClick={() => setSaveDialogOpen(true)}
                  disabled={!query.trim() && !submittedQuery}
                  title="Save this search"
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    savedSearches.some((s) => s.query === (query.trim() || submittedQuery))
                      ? "text-indigo-400 hover:text-indigo-300"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.08]",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                  aria-label="Save search"
                >
                  {savedSearches.some((s) => s.query === (query.trim() || submittedQuery))
                    ? <BookmarkCheck className="h-4 w-4" />
                    : <Bookmark className="h-4 w-4" />
                  }
                </button>
                <button
                  onClick={() => { setShowSuggestions(false); performSearch(); }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Autocomplete dropdown */}
            <AutocompleteDropdown
              suggestions={suggestions}
              activeIdx={activeSuggestionIdx}
              onSelect={selectSuggestion}
              visible={showSuggestions}
            />
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 max-w-3xl mx-auto">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(Number(e.target.value))}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={0}>All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PLATFORMS_LIST.map((p) => (
              <option key={p} value={p}>{p === "all" ? "All Platforms" : PLATFORM_LABELS[p] || p}</option>
            ))}
          </select>

          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SENTIMENTS_LIST.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Sentiment" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="date">Sort: Date</option>
            <option value="engagement">Sort: Engagement</option>
          </select>
        </div>

        {/* Saved Searches chips */}
        {savedSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 max-w-3xl mx-auto mt-4 pt-4 border-t border-white/[0.06]">
            <span className="text-xs text-slate-600 mr-1 shrink-0">Saved:</span>
            {savedSearches.map((s) => (
              <SavedSearchChip
                key={s.id}
                search={s}
                onRestore={handleRestoreSavedSearch}
                onDelete={handleDeleteSavedSearch}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      {!hasSearched ? (
        <div className="flex flex-col items-center justify-center py-20">
          <SearchIcon className="h-16 w-16 text-slate-700 mb-4" />
          <h2 className="text-xl font-semibold text-slate-300 mb-2">Search across all your collected mentions</h2>
          <p className="text-sm text-slate-500">
            Find conversations, authors, and trends across all monitored platforms
          </p>
          {savedSearches.length > 0 && (
            <p className="text-xs text-slate-600 mt-3">
              Or restore a saved search above
            </p>
          )}
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
                  className="glass-card rounded-xl p-4 hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="h-8 w-8 rounded-lg text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[result.platform] || "#64748b" }}
                    >
                      {(PLATFORM_LABELS[result.platform] || result.platform || "?").charAt(0).toUpperCase()}
                    </span>

                    <div className="flex-1 min-w-0">
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

                      <p className="text-sm text-slate-300 mb-2 leading-relaxed">
                        {highlightTerm(result.text, submittedQuery)}
                      </p>

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
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalResults)} of {totalResults}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { const p = Math.max(1, page - 1); setPage(p); performSearch(submittedQuery, p); }}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        p === page ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/[0.06]"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); performSearch(submittedQuery, p); }}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
