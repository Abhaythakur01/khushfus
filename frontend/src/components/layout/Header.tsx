"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  AlertCircle,
  FileText,
  MessageSquare,
  Info,
  CheckCheck,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { api, Notification } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

// Map notification type to an icon component
function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "alert":
      return <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />;
    case "report":
      return <FileText className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "mention":
      return <MessageSquare className="h-4 w-4 text-emerald-400 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-slate-400 shrink-0" />;
  }
}

export function Header({ title, onMenuClick, sidebarCollapsed }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // Close user menu on outside click
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

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications(1, 20);
      setNotifications(data.items ?? []);
      setUnreadCount((data.items ?? []).filter((n) => !n.is_read).length);
    } catch {
      // Gracefully fail — notifications are non-critical
    }
  }, []);

  // Fetch on mount and poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleNotifOpen = () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen) {
      setNotifLoading(true);
      fetchNotifications().finally(() => setNotifLoading(false));
    }
  };

  const handleMarkRead = async (n: Notification) => {
    if (n.is_read) return;
    try {
      await api.markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
    if (n.link) {
      setNotifOpen(false);
      router.push(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  return (
    <header
      role="banner"
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
        <div ref={notifRef} className="relative">
          <button
            onClick={handleNotifOpen}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            aria-haspopup="true"
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all duration-150"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-indigo-500 text-white rounded-full px-0.5 ring-2 ring-[#0a0f1a]" aria-label={`${unreadCount > 99 ? "99+" : unreadCount} unread notifications`}>
                <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
              </span>
            )}
            {unreadCount === 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-[#0a0f1a]" aria-hidden="true" />
            )}
          </button>

          {/* Notification dropdown */}
          {notifOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="notif-panel-title"
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#141925] rounded-xl border border-white/[0.08] shadow-2xl animate-scale-in overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span id="notif-panel-title" className="text-sm font-semibold text-slate-200">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={markingAll}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <Bell className="h-8 w-8 text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">No notifications yet</p>
                    <p className="text-xs text-slate-600 mt-0.5">We&apos;ll notify you of important activity here.</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleMarkRead(n)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]",
                        !n.is_read && "bg-indigo-500/[0.05]"
                      )}
                    >
                      <div className="mt-0.5">
                        <NotificationIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm leading-snug truncate",
                          n.is_read ? "text-slate-400" : "text-slate-200 font-medium"
                        )}>
                          {n.title || n.message}
                        </p>
                        {n.title && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-xs text-slate-600 mt-1">
                          {formatDate(n.created_at)}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
                    router.push("/settings?tab=profile");
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
