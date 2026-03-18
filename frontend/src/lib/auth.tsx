"use client";

/**
 * Authentication provider for the KhushFus SPA.
 *
 * SECURITY NOTE (6.1 — JWT storage trade-off):
 * The JWT is stored in localStorage (or sessionStorage when "Remember me" is
 * unchecked). localStorage is vulnerable to XSS — any injected script can read
 * the token. However, because this is a pure SPA talking to a separate API
 * server, httpOnly cookies require a Backend-For-Frontend (BFF) proxy to set
 * them on the same origin.
 *
 * Mitigations applied here:
 *   1. sessionStorage option (cleared when browser tab closes)
 *   2. JWT expiry checking on mount, on interval (60s), and on route changes
 *   3. Idle timeout — auto-logout after configurable period of inactivity
 *   4. CSP headers (see next.config.js) to reduce XSS surface
 *   5. CSRF headers on all API requests (see api.ts)
 *
 * Future plan: Migrate to a BFF pattern (Next.js API routes as proxy) that
 * sets httpOnly, Secure, SameSite=Strict cookies. This eliminates JS-based
 * token access entirely.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";
import type { User, Organization } from "./api";
import { canAccessRoute } from "./rbac";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOKEN_KEY = "khushfus_token";
const REMEMBER_KEY = "khushfus_remember";

/** How often (ms) to check whether the JWT has expired. */
const TOKEN_CHECK_INTERVAL_MS = 60_000;

/**
 * Idle timeout in milliseconds. If the user has had no interaction for this
 * long, the token is cleared on the next check. Set to 0 to disable.
 * Default: 30 minutes.
 */
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Decode the payload of a JWT without verifying the signature.
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64url → Base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT is expired (or will expire within `bufferMs`).
 * Returns true if expired/invalid, false if still valid.
 */
function isTokenExpired(token: string, bufferMs: number = 30_000): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    // No exp claim — treat as expired to be safe
    return true;
  }
  const expiresAt = payload.exp * 1000; // convert to ms
  return Date.now() + bufferMs >= expiresAt;
}

// ---------------------------------------------------------------------------
// Storage helpers (6.1 — sessionStorage vs localStorage)
// ---------------------------------------------------------------------------

function getStorage(): Storage {
  if (typeof window === "undefined") return localStorage;
  const remember = localStorage.getItem(REMEMBER_KEY);
  return remember === "false" ? sessionStorage : localStorage;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  // Check both storages (user may have switched preference)
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

function storeToken(token: string, remember: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_KEY, String(remember));
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

// ---------------------------------------------------------------------------
// Multi-tab auth sync via storage events
// ---------------------------------------------------------------------------

const AUTH_SYNC_KEY = "khushfus_auth_sync";

/** Broadcast an auth event to other tabs */
function broadcastAuthEvent(event: "logout" | "login"): void {
  if (typeof window === "undefined") return;
  // Write + immediately remove to trigger storage event in other tabs
  localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify({ event, ts: Date.now() }));
  localStorage.removeItem(AUTH_SYNC_KEY);
}

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  org: Organization | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<AuthState>({
    user: null,
    org: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  /** Track last user interaction time for idle timeout (6.1). */
  const lastActivityRef = useRef<number>(Date.now());

  // Update activity timestamp on user interactions
  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, []);

  const setAuth = useCallback(
    (user: User, token: string, org?: Organization | null, remember?: boolean) => {
      api.setToken(token);
      storeToken(token, remember ?? localStorage.getItem(REMEMBER_KEY) !== "false");
      setState({
        user,
        org: org ?? null,
        token,
        isLoading: false,
        isAuthenticated: true,
      });
    },
    [],
  );

  const clearAuth = useCallback(() => {
    api.clearToken();
    clearStoredToken();
    setState({
      user: null,
      org: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  // Wire up the API client to auto-logout on 401 responses
  useEffect(() => {
    api.setOnUnauthorized(() => {
      clearAuth();
      router.push("/login");
    });
    return () => {
      api.setOnUnauthorized(null);
    };
  }, [clearAuth, router]);

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
    if (!state.isLoading && !state.isAuthenticated && !publicPaths.some(p => pathname.startsWith(p))) {
      router.push("/login");
    }
  }, [state.isLoading, state.isAuthenticated, pathname, router]);

  // RBAC: redirect to /dashboard if user lacks permission for this route
  useEffect(() => {
    const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
    if (state.isLoading || !state.isAuthenticated || publicPaths.some(p => pathname.startsWith(p))) return;
    if (state.user && !canAccessRoute(state.user.role, pathname)) {
      router.push("/dashboard");
    }
  }, [state.isLoading, state.isAuthenticated, state.user, pathname, router]);

  // ---------------------------------------------------------------------------
  // 6.1 + 6.40 — Token expiry check on route change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!state.token) return;
    if (isTokenExpired(state.token)) {
      clearAuth();
      router.push("/login");
    }
  }, [pathname, state.token, clearAuth, router]);

  // ---------------------------------------------------------------------------
  // 6.40 — Periodic token expiry + idle timeout check (every 60s)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!state.token) return;

    const interval = setInterval(() => {
      // Check JWT expiry
      if (state.token && isTokenExpired(state.token)) {
        clearAuth();
        router.push("/login");
        return;
      }

      // Check idle timeout
      if (IDLE_TIMEOUT_MS > 0) {
        const idleDuration = Date.now() - lastActivityRef.current;
        if (idleDuration >= IDLE_TIMEOUT_MS) {
          clearAuth();
          router.push("/login");
        }
      }
    }, TOKEN_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [state.token, clearAuth, router]);

  // ---------------------------------------------------------------------------
  // Multi-tab auth sync: listen for logout/login from other tabs
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Detect token removal (direct localStorage manipulation)
      if (e.key === TOKEN_KEY && e.newValue === null && state.isAuthenticated) {
        clearAuth();
        router.push("/login");
        return;
      }
      // Detect broadcast events
      if (e.key === AUTH_SYNC_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.event === "logout" && state.isAuthenticated) {
            clearAuth();
            router.push("/login");
          }
        } catch { /* ignore parse errors */ }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [state.isAuthenticated, clearAuth, router]);

  // ---------------------------------------------------------------------------
  // Validate existing token on mount & load refresh token
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const token = getStoredToken();
    api.loadRefreshToken();
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    // 6.40 — Immediately reject expired tokens without hitting the server
    if (isTokenExpired(token)) {
      clearStoredToken();
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    api.setToken(token);
    api
      .getMe()
      .then((data) => {
        const user = data.user ?? data as User;
        setAuth(user, token, data.org ?? null);
      })
      .catch(() => {
        clearAuth();
      });
  }, [setAuth, clearAuth]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean = true) => {
      const data = await api.login(email, password);
      setAuth(data.user, data.access_token, undefined, remember);
    },
    [setAuth],
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const data = await api.register(email, password, fullName);
      setAuth(data.user, data.access_token);
    },
    [setAuth],
  );

  const logout = useCallback(() => {
    broadcastAuthEvent("logout");
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
