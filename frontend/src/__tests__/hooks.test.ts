/**
 * Tests for frontend hooks:
 *   - useFetch  (cache, dedup, stale-while-revalidate)
 *   - useAutoSave (draft persistence)
 *   - useUndoRedo (undo/redo state management)
 *   - useWebSocket (connection state)
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useFetch, clearFetchCache, _testCache } from "@/hooks/useFetch";
import { useAutoSave, loadDraft, clearDraft } from "@/hooks/useAutoSave";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useWebSocket } from "@/hooks/useWebSocket";

beforeEach(() => {
  clearFetchCache();
  jest.clearAllMocks();
});

describe("useFetch", () => {
  it("returns loading state initially, then data", async () => {
    const fetcher = jest.fn().mockResolvedValue({ name: "test" });
    const { result } = renderHook(() => useFetch("test-key", fetcher));

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({ name: "test" });
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns cached data on second render without re-fetching", async () => {
    const fetcher = jest.fn().mockResolvedValue([1, 2, 3]);

    const { result, unmount } = renderHook(() => useFetch("cached-key", fetcher));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    unmount();

    // Second render with same key — should use cache.
    const fetcher2 = jest.fn().mockResolvedValue([4, 5, 6]);
    const { result: result2 } = renderHook(() =>
      useFetch("cached-key", fetcher2, { ttl: 60_000 }),
    );

    // Should have cached data immediately (no loading).
    expect(result2.current.data).toEqual([1, 2, 3]);
    // Fetcher2 should NOT be called since data is fresh.
    expect(fetcher2).not.toHaveBeenCalled();
  });

  it("re-fetches when cache is stale (TTL expired)", async () => {
    const fetcher1 = jest.fn().mockResolvedValue("fresh");

    const { result, unmount } = renderHook(() =>
      useFetch("stale-key", fetcher1, { ttl: 1 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe("fresh");
    unmount();

    // Wait for TTL to expire.
    await new Promise((r) => setTimeout(r, 10));

    const fetcher2 = jest.fn().mockResolvedValue("revalidated");
    const { result: result2 } = renderHook(() =>
      useFetch("stale-key", fetcher2, { ttl: 1 }),
    );

    // Should show stale data initially (stale-while-revalidate).
    expect(result2.current.data).toBe("fresh");

    // Then revalidate.
    await waitFor(() => expect(result2.current.data).toBe("revalidated"));
    expect(fetcher2).toHaveBeenCalledTimes(1);
  });

  it("handles fetch errors gracefully", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useFetch("error-key", fetcher));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network error");
    expect(result.current.data).toBeNull();
  });

  it("mutate() with data optimistically updates state and cache", async () => {
    const fetcher = jest.fn().mockResolvedValue("original");
    const { result } = renderHook(() => useFetch("mutate-key", fetcher));

    await waitFor(() => expect(result.current.data).toBe("original"));

    act(() => {
      result.current.mutate("optimistic");
    });

    expect(result.current.data).toBe("optimistic");
    expect(_testCache.get("mutate-key")).toBeDefined();
  });

  it("mutate() without args clears cache and re-fetches", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    const { result } = renderHook(() => useFetch("refetch-key", fetcher));
    await waitFor(() => expect(result.current.data).toBe("first"));

    act(() => {
      result.current.mutate(null);
    });

    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when key is null", () => {
    const fetcher = jest.fn().mockResolvedValue("nope");
    const { result } = renderHook(() => useFetch(null, fetcher));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not fetch when enabled is false", () => {
    const fetcher = jest.fn().mockResolvedValue("nope");
    const { result } = renderHook(() =>
      useFetch("disabled-key", fetcher, { enabled: false }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useAutoSave — draft persistence to localStorage
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, val: string) => {
      store[key] = val;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

describe("useAutoSave", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  it("saves data to localStorage after the debounce delay", async () => {
    renderHook(() => useAutoSave("test-draft", { title: "Hello" }, 500));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "khushfus_draft_test-draft",
      JSON.stringify({ title: "Hello" }),
    );
  });

  it("does NOT save immediately (debounced)", () => {
    renderHook(() => useAutoSave("debounce-test", { text: "draft" }, 1000));

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("resets the timer when data changes before delay expires", () => {
    const { rerender } = renderHook(
      ({ data }) => useAutoSave("reset-test", data, 500),
      { initialProps: { data: "v1" } },
    );

    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Change data before the 500ms timer fires
    rerender({ data: "v2" });

    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Still not saved — the new timer hasn't fired
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "khushfus_draft_reset-test",
      JSON.stringify("v2"),
    );
  });

  it("clears the pending timer on unmount", () => {
    const { unmount } = renderHook(() => useAutoSave("unmount-test", { x: 1 }, 500));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // After unmount the timer should have been cancelled
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe("loadDraft", () => {
  it("returns null when no draft exists", () => {
    expect(loadDraft("missing-key")).toBeNull();
  });

  it("returns parsed JSON from localStorage", () => {
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ saved: true }));
    const result = loadDraft("saved-key");
    expect(result).toEqual({ saved: true });
  });

  it("returns null when localStorage contains invalid JSON", () => {
    localStorageMock.getItem.mockReturnValueOnce("not-valid-json{{{");
    const result = loadDraft("bad-json-key");
    expect(result).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes the key from localStorage", () => {
    clearDraft("to-clear");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("khushfus_draft_to-clear");
  });
});

// ---------------------------------------------------------------------------
// useUndoRedo
// ---------------------------------------------------------------------------

describe("useUndoRedo", () => {
  it("initialises with the provided state", () => {
    const { result } = renderHook(() => useUndoRedo("initial"));
    expect(result.current.state).toBe("initial");
  });

  it("canUndo and canRedo are false initially", () => {
    const { result } = renderHook(() => useUndoRedo(0));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("set() updates state and enables canUndo", () => {
    const { result } = renderHook(() => useUndoRedo("a"));

    act(() => result.current.set("b"));

    expect(result.current.state).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo() reverts to previous state", () => {
    const { result } = renderHook(() => useUndoRedo("a"));

    act(() => result.current.set("b"));
    act(() => result.current.undo());

    expect(result.current.state).toBe("a");
    expect(result.current.canUndo).toBe(false);
  });

  it("undo() enables canRedo", () => {
    const { result } = renderHook(() => useUndoRedo("a"));

    act(() => result.current.set("b"));
    act(() => result.current.undo());

    expect(result.current.canRedo).toBe(true);
  });

  it("redo() moves forward again", () => {
    const { result } = renderHook(() => useUndoRedo("a"));

    act(() => result.current.set("b"));
    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(result.current.state).toBe("b");
    expect(result.current.canRedo).toBe(false);
  });

  it("set() after undo clears the redo stack", () => {
    const { result } = renderHook(() => useUndoRedo("a"));

    act(() => result.current.set("b"));
    act(() => result.current.undo());
    act(() => result.current.set("c")); // new branch

    expect(result.current.canRedo).toBe(false);
    expect(result.current.state).toBe("c");
  });

  it("handles multiple undo/redo steps correctly", () => {
    const { result } = renderHook(() => useUndoRedo(0));

    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.set(3));

    act(() => result.current.undo()); // -> 2
    act(() => result.current.undo()); // -> 1

    expect(result.current.state).toBe(1);

    act(() => result.current.redo()); // -> 2

    expect(result.current.state).toBe(2);
  });

  it("undo() is a no-op when there is no history", () => {
    const { result } = renderHook(() => useUndoRedo("only"));

    act(() => result.current.undo());

    expect(result.current.state).toBe("only");
    expect(result.current.canUndo).toBe(false);
  });

  it("redo() is a no-op when future is empty", () => {
    const { result } = renderHook(() => useUndoRedo("only"));

    act(() => result.current.redo());

    expect(result.current.state).toBe("only");
    expect(result.current.canRedo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useWebSocket — connection state and message parsing
// ---------------------------------------------------------------------------

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  public onopen: (() => void) | null = null;
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public readyState = MockWebSocket.OPEN;

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => this.onopen?.(), 0);
  }

  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });
}

(global as any).WebSocket = MockWebSocket;

describe("useWebSocket", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    // NOTE: Do NOT use fake timers here — waitFor() requires real timers.
  });

  it("starts in disconnected state when projectId is null", () => {
    const { result } = renderHook(() => useWebSocket(null));
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
  });

  it("does not connect when no auth token is stored", () => {
    // No token in localStorage
    const { result } = renderHook(() => useWebSocket(1));
    act(() => {
      jest.advanceTimersByTime(100);
    });
    // Without a token, connection should not advance to "connected"
    expect(result.current.connectionState).not.toBe("connected");
  });

  it("starts connecting when projectId and token are both present", async () => {
    localStorageMock.getItem.mockReturnValue("valid-token");
    const { result } = renderHook(() => useWebSocket(42));

    await waitFor(() => {
      expect(result.current.connectionState).toBe("connected");
    });
  });

  it("isConnected is true once WebSocket opens", async () => {
    localStorageMock.getItem.mockReturnValue("valid-token");
    const { result } = renderHook(() => useWebSocket(1));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("lastMessage is null initially", () => {
    const { result } = renderHook(() => useWebSocket(null));
    expect(result.current.lastMessage).toBeNull();
  });
});
