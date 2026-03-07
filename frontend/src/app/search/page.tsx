"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search as SearchIcon,
  X,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  MessageCircle,
  ExternalLink,
  Star,
  Clock,
  TrendingUp,
  Bookmark,
  BookmarkCheck,
  SlidersHorizontal,
  ChevronUp,
} from "lucide-react";
import { cn, formatNumber, truncate } from "@/lib/utils";

// ---------- types & data ----------

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
  id: number;
  name: string;
  query: string;
  filters: Record<string, string>;
  created_at: string;
}

const MOCK_RESULTS: SearchResult[] = [
  { id: 1, platform: "twitter", author_name: "Sarah Chen", author_handle: "@sarahc_design", author_followers: 24500, text: "Just tried the new NovaBrand skincare line and I'm genuinely impressed. The hydrating serum absorbed instantly and my skin feels incredible after just one week.", sentiment: "positive", likes: 342, shares: 89, comments: 47, created_at: "2026-03-07T10:30:00Z", source_url: "#" },
  { id: 2, platform: "instagram", author_name: "Mike Torres", author_handle: "@mike.torres.fit", author_followers: 156000, text: "Morning routine featuring NovaBrand Vitamin C serum. 3 months in and the results speak for themselves. Swipe for before/after!", sentiment: "positive", likes: 4521, shares: 230, comments: 312, created_at: "2026-03-07T08:15:00Z", source_url: "#" },
  { id: 3, platform: "reddit", author_name: "skincare_guru22", author_handle: "u/skincare_guru22", author_followers: 890, text: "Has anyone else had issues with NovaBrand customer service? Ordered 2 weeks ago and still no shipping confirmation.", sentiment: "negative", likes: 127, shares: 12, comments: 43, created_at: "2026-03-07T06:45:00Z", source_url: "#" },
  { id: 4, platform: "youtube", author_name: "Beauty by Priya", author_handle: "@beautybypriya", author_followers: 320000, text: "HONEST REVIEW: NovaBrand's entire 2026 spring collection. Some products are amazing, others not so much.", sentiment: "neutral", likes: 8923, shares: 1240, comments: 892, created_at: "2026-03-06T22:00:00Z", source_url: "#" },
  { id: 5, platform: "twitter", author_name: "James R.", author_handle: "@jamesr_nyc", author_followers: 1200, text: "NovaBrand really needs to reformulate their moisturizer. The new version broke me out badly.", sentiment: "negative", likes: 56, shares: 14, comments: 22, created_at: "2026-03-06T19:30:00Z", source_url: "#" },
  { id: 6, platform: "tiktok", author_name: "Glow Queen", author_handle: "@glowqueen", author_followers: 890000, text: "POV: You finally find a sunscreen that doesn't leave a white cast. Thank you NovaBrand SPF 50! Dark skin friendly sunscreen that actually works.", sentiment: "positive", likes: 45000, shares: 12300, comments: 3400, created_at: "2026-03-06T14:20:00Z", source_url: "#" },
  { id: 7, platform: "linkedin", author_name: "David Park", author_handle: "david-park-cmo", author_followers: 18500, text: "Impressed by NovaBrand's sustainability report for Q1 2026. Their commitment to recyclable packaging sets a new benchmark.", sentiment: "positive", likes: 567, shares: 123, comments: 45, created_at: "2026-03-06T11:00:00Z", source_url: "#" },
  { id: 8, platform: "instagram", author_name: "Emma Rodriguez", author_handle: "@emmabeautyrd", author_followers: 45000, text: "Comparing NovaBrand vs GlowCo retinol serums side by side. After 6 weeks of testing, here's my honest take.", sentiment: "neutral", likes: 1890, shares: 340, comments: 267, created_at: "2026-03-05T20:30:00Z", source_url: "#" },
  { id: 9, platform: "facebook", author_name: "Karen Mitchell", author_handle: "karen.mitchell.55", author_followers: 320, text: "Worst experience with NovaBrand! Received a damaged package, took 5 calls to get a replacement. Never again.", sentiment: "negative", likes: 23, shares: 8, comments: 15, created_at: "2026-03-05T12:30:00Z", source_url: "#" },
  { id: 10, platform: "tiktok", author_name: "Derek Styles", author_handle: "@derekstyles", author_followers: 67000, text: "Men's skincare routine using only NovaBrand products. Yes guys, skincare is for everyone.", sentiment: "positive", likes: 12300, shares: 2100, comments: 890, created_at: "2026-03-05T10:00:00Z", source_url: "#" },
  { id: 11, platform: "youtube", author_name: "Dr. Amy Liu", author_handle: "@dramyliu", author_followers: 520000, text: "Dermatologist reacts to NovaBrand's new anti-aging line. Breaking down the science behind their peptide complex.", sentiment: "neutral", likes: 15600, shares: 3200, comments: 1450, created_at: "2026-03-04T22:00:00Z", source_url: "#" },
  { id: 12, platform: "twitter", author_name: "Tech Beauty Blog", author_handle: "@techbeautyblog", author_followers: 34000, text: "NovaBrand just launched their AR try-on feature in their app. Tested it out and it's surprisingly accurate.", sentiment: "positive", likes: 890, shares: 234, comments: 67, created_at: "2026-03-04T17:30:00Z", source_url: "#" },
  { id: 13, platform: "reddit", author_name: "ingredient_nerd", author_handle: "u/ingredient_nerd", author_followers: 2300, text: "Broke down the NovaBrand Vitamin C serum ingredients list. It's actually quite well-formulated: 15% L-ascorbic acid.", sentiment: "positive", likes: 456, shares: 89, comments: 67, created_at: "2026-03-04T15:45:00Z", source_url: "#" },
  { id: 14, platform: "twitter", author_name: "Consumer Watch", author_handle: "@consumerwatch", author_followers: 89000, text: "BREAKING: NovaBrand recalls batch of their eye cream due to potential contamination. Check batch numbers.", sentiment: "negative", likes: 2340, shares: 4500, comments: 890, created_at: "2026-03-03T20:00:00Z", source_url: "#" },
  { id: 15, platform: "instagram", author_name: "Clean Beauty Co", author_handle: "@cleanbeautyco", author_followers: 210000, text: "Our top 10 cruelty-free brands for 2026 and NovaBrand made the list at #3! Commitment to ethical sourcing impresses.", sentiment: "positive", likes: 5600, shares: 890, comments: 345, created_at: "2026-03-02T16:00:00Z", source_url: "#" },
];

const MOCK_SAVED_SEARCHES: SavedSearch[] = [
  { id: 1, name: "Brand mentions this week", query: "NovaBrand", filters: { sentiment: "all" }, created_at: "2026-03-05T10:00:00Z" },
  { id: 2, name: "Negative feedback tracker", query: "NovaBrand", filters: { sentiment: "negative" }, created_at: "2026-03-01T14:00:00Z" },
  { id: 3, name: "Competitor comparisons", query: "NovaBrand vs", filters: { platform: "all" }, created_at: "2026-02-20T09:00:00Z" },
];

const AUTOCOMPLETE_SUGGESTIONS = [
  "NovaBrand skincare",
  "NovaBrand review",
  "NovaBrand vs GlowCo",
  "NovaBrand recall",
  "NovaBrand serum",
  "NovaBrand pricing",
  "NovaBrand sustainability",
  "NovaBrand influencer",
];

const PLATFORM_FACETS = [
  { id: "twitter", label: "Twitter", count: 4 },
  { id: "instagram", label: "Instagram", count: 3 },
  { id: "reddit", label: "Reddit", count: 2 },
  { id: "youtube", label: "YouTube", count: 2 },
  { id: "tiktok", label: "TikTok", count: 2 },
  { id: "linkedin", label: "LinkedIn", count: 1 },
  { id: "facebook", label: "Facebook", count: 1 },
];

const SENTIMENT_FACETS = [
  { id: "positive", label: "Positive", count: 7, color: "text-emerald-600" },
  { id: "negative", label: "Negative", count: 4, color: "text-red-600" },
  { id: "neutral", label: "Neutral", count: 4, color: "text-gray-600" },
];

const LANGUAGE_FACETS = [
  { id: "en", label: "English", count: 13 },
  { id: "es", label: "Spanish", count: 1 },
  { id: "fr", label: "French", count: 1 },
];

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-sky-500",
  instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
  facebook: "bg-blue-600",
  linkedin: "bg-blue-700",
  youtube: "bg-red-600",
  reddit: "bg-orange-500",
  tiktok: "bg-gray-900",
};

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  tiktok: "TikTok",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-800",
  negative: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-700",
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
  return `${Math.floor(diffD / 7)}w ago`;
}

function highlightTerm(text: string, term: string): React.ReactNode {
  if (!term.trim()) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// ---------- main page ----------

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "engagement">("relevance");

  // Filters
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [selectedSentiments, setSelectedSentiments] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Saved searches
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(MOCK_SAVED_SEARCHES);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = query.trim()
    ? AUTOCOMPLETE_SUGGESTIONS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : [...AUTOCOMPLETE_SUGGESTIONS.slice(0, 3).map((s) => ({ text: s, type: "trending" }))].map(
        (s) => (typeof s === "string" ? s : s.text)
      );

  function performSearch(q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setSubmittedQuery(searchQuery);
    setShowAutocomplete(false);
    setPage(1);

    setTimeout(() => {
      let filtered = MOCK_RESULTS.filter(
        (r) =>
          r.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.author_name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      // Apply filters
      if (selectedPlatforms.size > 0) {
        filtered = filtered.filter((r) => selectedPlatforms.has(r.platform));
      }
      if (selectedSentiments.size > 0) {
        filtered = filtered.filter((r) => selectedSentiments.has(r.sentiment));
      }
      if (authorFilter.trim()) {
        const af = authorFilter.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.author_name.toLowerCase().includes(af) ||
            r.author_handle.toLowerCase().includes(af)
        );
      }

      // Sort
      if (sortBy === "date") {
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (sortBy === "engagement") {
        filtered.sort((a, b) => b.likes + b.shares + b.comments - (a.likes + a.shares + a.comments));
      }

      setResults(filtered);
      setIsSearching(false);
    }, 500);
  }

  function applyFilters() {
    if (submittedQuery) performSearch(submittedQuery);
  }

  function toggleFacet(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  function saveSearch() {
    if (!saveSearchName.trim() || !submittedQuery) return;
    const newSave: SavedSearch = {
      id: Date.now(),
      name: saveSearchName,
      query: submittedQuery,
      filters: {},
      created_at: new Date().toISOString(),
    };
    setSavedSearches((prev) => [newSave, ...prev]);
    setSaveSearchName("");
    setShowSaveDialog(false);
  }

  function loadSavedSearch(s: SavedSearch) {
    setQuery(s.query);
    performSearch(s.query);
  }

  const totalResults = results.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const pagedResults = results.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="relative max-w-3xl mx-auto">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowAutocomplete(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") performSearch();
                  if (e.key === "Escape") setShowAutocomplete(false);
                }}
                onFocus={() => setShowAutocomplete(true)}
                placeholder="Search mentions, authors, topics..."
                className="w-full h-12 rounded-xl border border-gray-300 bg-white pl-12 pr-24 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
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

            {/* Autocomplete */}
            {showAutocomplete && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                {query.trim() === "" && (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Trending Searches
                    </span>
                  </div>
                )}
                {filteredSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(s);
                      performSearch(s);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    {query.trim() === "" ? (
                      <TrendingUp className="h-4 w-4 text-gray-400 shrink-0" />
                    ) : (
                      <SearchIcon className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-sm text-gray-700">{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {!hasSearched ? (
          /* Landing state */
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8 mt-8">
              <SearchIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700">Search across all mentions</h2>
              <p className="text-sm text-gray-500 mt-1">
                Find conversations, authors, and trends across all monitored platforms
              </p>
            </div>

            {/* Saved searches */}
            {savedSearches.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Bookmark className="h-4 w-4" /> Saved Searches
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {savedSearches.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSavedSearch(s)}
                      className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all"
                    >
                      <p className="text-sm font-medium text-gray-900 mb-1">{s.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <SearchIcon className="h-3 w-3" /> {s.query}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Results layout */
          <div className="flex gap-6">
            {/* Filter sidebar */}
            <div
              className={cn(
                "shrink-0 transition-all duration-200",
                showFilters ? "w-64" : "w-0 overflow-hidden"
              )}
            >
              <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 lg:hidden"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Platform facets */}
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Platform
                  </h4>
                  <div className="space-y-1.5">
                    {PLATFORM_FACETS.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlatforms.has(f.id)}
                          onChange={() =>
                            toggleFacet(selectedPlatforms, f.id, setSelectedPlatforms)
                          }
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">
                          {f.label}
                        </span>
                        <span className="text-xs text-gray-400">{f.count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sentiment facets */}
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Sentiment
                  </h4>
                  <div className="space-y-1.5">
                    {SENTIMENT_FACETS.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSentiments.has(f.id)}
                          onChange={() =>
                            toggleFacet(selectedSentiments, f.id, setSelectedSentiments)
                          }
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={cn("text-sm flex-1", f.color)}>
                          {f.label}
                        </span>
                        <span className="text-xs text-gray-400">{f.count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Language facets */}
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Language
                  </h4>
                  <div className="space-y-1.5">
                    {LANGUAGE_FACETS.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLanguages.has(f.id)}
                          onChange={() =>
                            toggleFacet(selectedLanguages, f.id, setSelectedLanguages)
                          }
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">
                          {f.label}
                        </span>
                        <span className="text-xs text-gray-400">{f.count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date range */}
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Date Range
                  </h4>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full h-8 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full h-8 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Author filter */}
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Author
                  </h4>
                  <input
                    type="text"
                    value={authorFilter}
                    onChange={(e) => setAuthorFilter(e.target.value)}
                    placeholder="Filter by author..."
                    className="w-full h-8 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  onClick={applyFilters}
                  className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Apply Filters
                </button>

                {/* Saved searches */}
                {savedSearches.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Bookmark className="h-3 w-3" /> Saved Searches
                    </h4>
                    <div className="space-y-1">
                      {savedSearches.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => loadSavedSearch(s)}
                          className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-xs text-gray-700 transition-colors"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Results area */}
            <div className="flex-1 min-w-0">
              {/* Results header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {!showFilters && (
                    <button
                      onClick={() => setShowFilters(true)}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                  )}
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{totalResults}</span> results
                    for &quot;<span className="font-medium">{submittedQuery}</span>&quot;
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                  >
                    <Bookmark className="h-3.5 w-3.5" /> Save search
                  </button>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as typeof sortBy);
                      setTimeout(() => performSearch(submittedQuery), 0);
                    }}
                    className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="relevance">Sort: Relevance</option>
                    <option value="date">Sort: Date</option>
                    <option value="engagement">Sort: Engagement</option>
                  </select>
                </div>
              </div>

              {/* Save search dialog */}
              {showSaveDialog && (
                <div className="mb-4 p-4 bg-white rounded-xl border border-indigo-200 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Save this search</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveSearch()}
                      placeholder="Name your search..."
                      className="flex-1 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button
                      onClick={saveSearch}
                      className="px-4 h-9 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSaveDialog(false)}
                      className="px-3 h-9 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Results list */}
              {isSearching ? (
                <div className="flex items-center justify-center h-48">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                </div>
              ) : pagedResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <SearchIcon className="h-12 w-12 mb-3" />
                  <p className="text-lg font-medium">No results found</p>
                  <p className="text-sm">Try different keywords or adjust filters</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagedResults.map((result) => (
                    <div
                      key={result.id}
                      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        {/* Platform icon */}
                        <span
                          className={cn(
                            "h-8 w-8 rounded-lg text-white text-xs font-bold inline-flex items-center justify-center shrink-0",
                            PLATFORM_COLORS[result.platform] || "bg-gray-500"
                          )}
                        >
                          {(PLATFORM_LABELS[result.platform] || result.platform)
                            .charAt(0)
                            .toUpperCase()}
                        </span>

                        <div className="flex-1 min-w-0">
                          {/* Author */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-900">
                              {result.author_name}
                            </span>
                            <span className="text-xs text-gray-400">
                              {result.author_handle}
                            </span>
                            {result.author_followers > 10000 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">
                                <Star className="h-2.5 w-2.5" /> Influencer
                              </span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto shrink-0">
                              {relativeTime(result.created_at)}
                            </span>
                          </div>

                          {/* Text with highlighting */}
                          <p className="text-sm text-gray-700 mb-2 leading-relaxed">
                            {highlightTerm(result.text, submittedQuery)}
                          </p>

                          {/* Engagement + sentiment */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
                                SENTIMENT_COLORS[result.sentiment]
                              )}
                            >
                              {result.sentiment.charAt(0).toUpperCase() +
                                result.sentiment.slice(1)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Heart className="h-3 w-3" /> {formatNumber(result.likes)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Share2 className="h-3 w-3" /> {formatNumber(result.shares)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <MessageCircle className="h-3 w-3" />{" "}
                              {formatNumber(result.comments)}
                            </span>

                            <a
                              href={result.source_url}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 ml-auto"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalResults > 0 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-gray-500">
                    Showing {(page - 1) * pageSize + 1}-
                    {Math.min(page * pageSize, totalResults)} of {totalResults}
                  </p>
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
