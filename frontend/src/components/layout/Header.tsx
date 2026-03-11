"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getInitials } from "@/lib/utils";
import {
  Search,
  Bell,
  Menu,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/lib/theme";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ title, onMenuClick, sidebarCollapsed }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click — only listen when menu is open
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 lg:px-6 transition-all duration-200",
      )}
    >
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-2 -ml-2 mr-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <h1 className="text-lg font-semibold text-slate-100 mr-4 whitespace-nowrap">
        {title}
      </h1>

      {/* Search bar */}
      <form
        onSubmit={handleSearch}
        className="hidden md:flex items-center flex-1 max-w-md mx-auto"
      >
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mentions, keywords..."
            className="w-full h-9 pl-10 pr-4 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-200 placeholder:text-slate-400 input-focus transition-colors"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 ml-auto">
        {/* Theme toggle */}
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
            setTheme(next);
          }}
          aria-label={`Switch theme (current: ${theme})`}
          title={`Theme: ${theme}`}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          {theme === "dark" && <Moon className="h-5 w-5" />}
          {theme === "light" && <Sun className="h-5 w-5" />}
          {theme === "system" && <Monitor className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <button
          aria-label="Notifications"
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full" />
        </button>

        {/* User dropdown */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-semibold">
              {user ? getInitials(user.full_name) : "?"}
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-300">
              {user?.full_name || "User"}
            </span>
            <ChevronDown className="hidden sm:block h-4 w-4 text-slate-400" />
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-slate-900 rounded-xl shadow-lg border border-slate-700 py-1 animate-fade-in">
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-medium text-slate-200">
                  {user?.full_name}
                </p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/settings");
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/settings");
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="border-t border-slate-700 mt-1 pt-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger-600 hover:bg-red-900/30 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
