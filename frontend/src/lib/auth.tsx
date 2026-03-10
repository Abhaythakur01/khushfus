"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  org_id: number;
  avatar_url?: string;
}

interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  org: Organization | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "khushfus_token";

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

  const setAuth = useCallback(
    (user: User, token: string, org?: Organization | null) => {
      api.setToken(token);
      localStorage.setItem(TOKEN_KEY, token);
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
    localStorage.removeItem(TOKEN_KEY);
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
    const publicPaths = ["/login", "/register"];
    if (!state.isLoading && !state.isAuthenticated && !publicPaths.includes(pathname)) {
      router.push("/login");
    }
  }, [state.isLoading, state.isAuthenticated, pathname, router]);

  // Validate existing token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    api.setToken(token);
    api
      .getMe()
      .then((data) => {
        setAuth(data.user ?? data, token, data.org ?? null);
      })
      .catch(() => {
        clearAuth();
      });
  }, [setAuth, clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.login(email, password);
      setAuth(data.user, data.access_token);
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
