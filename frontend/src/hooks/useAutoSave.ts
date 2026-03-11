"use client";

import { useEffect, useRef, useCallback } from "react";

const STORAGE_PREFIX = "khushfus_draft_";

/**
 * Auto-saves data to localStorage on a debounced interval.
 *
 * @param key   Unique key for this draft (prefixed automatically)
 * @param data  The data to persist (must be JSON-serializable)
 * @param delay Debounce interval in ms (default 5000)
 */
export function useAutoSave(key: string, data: unknown, delay: number = 5000): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    // Clear any pending save
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const serialized = JSON.stringify(dataRef.current);
        localStorage.setItem(STORAGE_PREFIX + key, serialized);
      } catch {
        // localStorage full or data not serializable — silently ignore
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, data, delay]);
}

/**
 * Load a previously saved draft from localStorage.
 * Returns `null` if no draft exists or parsing fails.
 */
export function loadDraft<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Remove a saved draft from localStorage.
 */
export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}
