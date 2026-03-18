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
      className="sticky top-0 z-20 flex items-center h-16 bg-[#0a0f1a]/80 backdrop-blur-xl border-b border-white/[0.04] px-4 lg:px-6 xl:px-8 transition-all duration-300"
    >
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-2 -ml-2 mr-3 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all duration-150"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <h1 className="text-base font-semibold text-slate-100 mr-4 whitespace-nowrap tracking-tight">
        {title}
      </h1>

      {/* Search bar */}
      <form
        onSubmit={handleSearch}
        role="search"
        aria-label="Search mentions"
        className="hidden md:flex items-center flex-1 max-w-md mx-auto"
      >
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mentions, keywords..."
            aria-label="Search mentions"
            className="w-full h-9 pl-10 pr-4 rounded-lg border border-white/[0.06] bg-white/[0.03] text-sm text-slate-200 placeholder:text-slate-500 input-focus transition-all duration-200 hover:bg-white/[0.05] hover:border-white/[0.1]"
          />
        </div>
      </form>

      <div className="flex items-center gap-1.5 ml-auto">
        {/* Theme toggle */}
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
            setTheme(next);
          }}
          aria-label={`Switch theme (current: ${theme})`}
          title={`Theme: ${theme}`}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all duration-150"
        >
          {theme === "dark" && <Moon className="h-[18px] w-[18px]" />}
          {theme === "light" && <Sun className="h-[18px] w-[18px]" />}
          {theme === "system" && <Monitor className="h-[18px] w-[18px]" />}
        </button>

        {/* Notifications */}
        <button
          aria-label="Notifications"
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all duration-150"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-[#0a0f1a]" />
        </button>

        {/* User dropdown */}
        <div ref={userMenuRef} className="relative ml-1">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.06] transition-all duration-150"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-sm shadow-indigo-500/20">
              {user ? getInitials(user.full_name) : "?"}
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-300">
              {user?.full_name || "User"}
            </span>
            <ChevronDown className={cn(
              "hidden sm:block h-3.5 w-3.5 text-slate-500 transition-transform duration-200",
              userMenuOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-56 bg-[#141925] rounded-xl border border-white/[0.08] shadow-2xl py-1 animate-scale-in">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <p className="text-sm font-medium text-slate-200">
                  {user?.full_name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-all duration-150"
                >
                  <User className="h-4 w-4" />
                  Profile
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-all duration-150"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
              </div>
              <div className="border-t border-white/[0.06] pt-1">
                <button
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.06] transition-all duration-150"
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
