"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// 6.10 — Lightweight SWR-like data fetching hook
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface UseFetchOptions {
  /** Time-to-live in milliseconds. Default: 60_000 (1 minute). */
  ttl?: number;
  /** Re-fetch when the window regains focus. Default: true. */
  revalidateOnFocus?: boolean;
  /** Disable automatic fetching (manual control only). Default: false. */
  enabled?: boolean;
}

interface UseFetchResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** Optimistically update or clear the cached data, then optionally revalidate. */
  mutate: (data?: T | null) => void;
}

// Module-level in-memory cache shared across all hook instances.
const cache = new Map<string, CacheEntry<unknown>>();

// In-flight request deduplication: same key returns the same promise.
const inflight = new Map<string, Promise<unknown>>();

function isStale(entry: CacheEntry<unknown>, ttl: number): boolean {
  return Date.now() - entry.timestamp > ttl;
}

/**
 * A lightweight data-fetching hook with:
 *  - In-memory cache (Map with configurable TTL)
 *  - Request deduplication (same key returns same promise)
 *  - Stale-while-revalidate (returns cached data immediately, revalidates in background)
 *  - Auto-refetch on window focus
 */
export function useFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: UseFetchOptions,
): UseFetchResult<T> {
  const ttl = options?.ttl ?? 60_000;
  const revalidateOnFocus = options?.revalidateOnFocus ?? true;
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<T | null>(() => {
    if (!key) return null;
    const cached = cache.get(key) as CacheEntry<T> | undefined;
    return cached ? cached.data : null;
  });
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!key || !enabled) return false;
    const cached = cache.get(key);
    return !cached;
  });

  // Keep fetcher ref stable to avoid re-triggering effects when the caller
  // creates a new arrow function on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const keyRef = useRef(key);
  keyRef.current = key;

  // Keep ttl in a ref so it doesn't trigger effect re-runs when the caller
  // passes a new literal on each render.
  const ttlRef = useRef(ttl);
  ttlRef.current = ttl;

  // Core revalidation function.
  const revalidate = useCallback(async () => {
    const currentKey = keyRef.current;
    if (!currentKey) return;

    // Deduplicate: if an identical request is already in-flight, wait for it.
    const existing = inflight.get(currentKey);
    if (existing) {
      try {
        const result = (await existing) as T;
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const promise = fetcherRef.current();
    inflight.set(currentKey, promise);

    try {
      const result = await promise;
      // Only apply if the key hasn't changed while we were fetching.
      if (keyRef.current === currentKey) {
        cache.set(currentKey, { data: result, timestamp: Date.now() });
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (keyRef.current === currentKey) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      inflight.delete(currentKey);
      if (keyRef.current === currentKey) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch + stale-while-revalidate on key/enabled change.
  useEffect(() => {
    if (!key || !enabled) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const cached = cache.get(key) as CacheEntry<T> | undefined;
    if (cached) {
      setData(cached.data);
      if (isStale(cached, ttlRef.current)) {
        // Background revalidation — don't show loading spinner.
        revalidate();
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
      revalidate();
    }
  }, [key, enabled, revalidate]);

  // Auto-refetch on window focus.
  useEffect(() => {
    if (!revalidateOnFocus || !key || !enabled) return;
    if (typeof window === "undefined") return;

    const onFocus = () => {
      const cached = cache.get(key) as CacheEntry<T> | undefined;
      if (!cached || isStale(cached, ttlRef.current)) {
        revalidate();
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [revalidateOnFocus, key, enabled, revalidate]);

  // Mutate: optimistically update cache & state.
  const mutate = useCallback(
    (newData?: T | null) => {
      if (!key) return;
      if (newData === undefined || newData === null) {
        // Clear cache and re-fetch.
        cache.delete(key);
        setIsLoading(true);
        revalidate();
      } else {
        cache.set(key, { data: newData, timestamp: Date.now() });
        setData(newData);
      }
    },
    [key, revalidate],
  );

  return { data, error, isLoading, mutate };
}

// ---------------------------------------------------------------------------
// Utility: clear the entire cache (useful for logout or testing)
// ---------------------------------------------------------------------------
export function clearFetchCache() {
  cache.clear();
  inflight.clear();
}

// Expose cache for testing purposes only.
export const _testCache = cache;
