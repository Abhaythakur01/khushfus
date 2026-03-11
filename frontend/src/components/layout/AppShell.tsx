"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { trackPageView } from "@/lib/analytics";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // 6.48 — Track page views on route changes
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  // While auth state is loading, show a centered spinner
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // If not authenticated the AuthProvider will redirect to /login;
  // render nothing in the meantime to prevent flashing protected content.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        Skip to main content
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "transition-all duration-200",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64",
        )}
      >
        <Header
          title={title}
          onMenuClick={() => setMobileOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main id="main-content" className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
