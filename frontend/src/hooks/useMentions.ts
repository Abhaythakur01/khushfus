"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

export interface MentionFilters {
  platform?: string;
  sentiment?: string;
  language?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface MentionAuthor {
  name: string;
  handle: string;
  avatar_url?: string;
  followers: number;
  influence_score: number;
  is_bot: boolean;
}

export interface Mention {
  id: number;
  platform: string;
  author: MentionAuthor;
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  sentiment_confidence: number;
  likes: number;
  shares: number;
  comments: number;
  reach: number;
  keywords: string[];
  topics: string[];
  source_url: string;
  has_media: boolean;
  is_flagged: boolean;
  language: string;
  created_at: string;
}

function normalizeMention(raw: any): Mention {
  return {
    id: raw.id,
    platform: raw.platform || "other",
    author: {
      name: raw.author_name || raw.author?.name || "Unknown",
      handle: raw.author_handle || raw.author?.handle || "",
      avatar_url: raw.author_profile_url || raw.author?.avatar_url || "",
      followers: raw.author_followers || raw.author?.followers || 0,
      influence_score: raw.influence_score || raw.author?.influence_score || 0,
      is_bot: raw.is_bot || raw.author?.is_bot || false,
    },
    text: raw.text || raw.content || "",
    sentiment: raw.sentiment || "neutral",
    sentiment_score: raw.sentiment_score || 0,
    sentiment_confidence: raw.sentiment_confidence || 0,
    likes: raw.likes || 0,
    shares: raw.shares || 0,
    comments: raw.comments || 0,
    reach: raw.reach || 0,
    keywords: typeof raw.matched_keywords === "string"
      ? raw.matched_keywords.split(",").filter(Boolean)
      : raw.keywords || [],
    topics: typeof raw.topics === "string"
      ? raw.topics.split(",").filter(Boolean)
      : raw.topics || [],
    source_url: raw.source_url || "",
    has_media: raw.has_media || false,
    is_flagged: raw.is_flagged || false,
    language: raw.language || "en",
    created_at: raw.created_at || raw.collected_at || raw.published_at || "",
  };
}

export function useMentions(projectId: number, filters?: MentionFilters) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [currentFilters, setCurrentFilters] = useState<MentionFilters>(filters || {});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchMentions = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setMentions([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    // Increment sequence counter; only the latest request will apply its results
    const seq = ++requestSeqRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
      };

      if (currentFilters.platform && currentFilters.platform !== "all") {
        params.platform = currentFilters.platform;
      }
      if (currentFilters.sentiment && currentFilters.sentiment !== "all") {
        params.sentiment = currentFilters.sentiment;
      }
      if (currentFilters.search) {
        params.search = currentFilters.search;
      }
      if (currentFilters.dateFrom) {
        params.startDate = currentFilters.dateFrom;
      }
      if (currentFilters.dateTo) {
        params.endDate = currentFilters.dateTo;
      }

      const data = await api.getMentions(projectId, params, signal);

      // Discard stale responses from earlier requests
      if (seq !== requestSeqRef.current) return;

      // Handle both paginated { items, total } and plain array responses
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (data as any)?.items || data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalCount = (data as any)?.total ?? items.length;

      setMentions(items.map(normalizeMention));
      setTotal(totalCount);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Discard errors from stale requests
      if (seq !== requestSeqRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load mentions";
      console.error("Failed to load mentions:", err);
      setError(message);
      setMentions([]);
      setTotal(0);
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, page, pageSize, currentFilters]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMentions(controller.signal);
    return () => controller.abort();
  }, [fetchMentions]);

  const setFilters = (newFilters: MentionFilters) => {
    setCurrentFilters(newFilters);
    setPage(1);
  };

  const toggleFlag = async (id: number) => {
    const mention = mentions.find((m) => m.id === id);
    if (!mention) return;

    const newFlagged = !mention.is_flagged;

    // Optimistic update
    setMentions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_flagged: newFlagged } : m))
    );

    try {
      await api.flagMention(id, newFlagged);
    } catch (err) {
      // Revert on failure
      console.error("Failed to toggle flag:", err);
      setMentions((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_flagged: !newFlagged } : m))
      );
    }
  };

  return {
    mentions,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    setFilters,
    filters: currentFilters,
    isLoading,
    error,
    toggleFlag,
    refetch: fetchMentions,
  };
}
