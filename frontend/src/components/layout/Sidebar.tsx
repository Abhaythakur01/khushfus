"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canAccessRoute } from "@/lib/rbac";
import { getInitials } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  FolderKanban,
  BarChart3,
  TrendingUp,
  Search,
  FileText,
  Bell,
  Send,
  ClipboardList,
  Settings,
  LogOut,
  ChevronDown,
  ChevronLeft,
  X,
  Zap,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { label: "Mentions", href: "/mentions", icon: <MessageSquare className="h-[18px] w-[18px]" /> },
  { label: "Projects", href: "/projects", icon: <FolderKanban className="h-[18px] w-[18px]" /> },
  { label: "Analytics", href: "/analytics", icon: <BarChart3 className="h-[18px] w-[18px]" /> },
  { label: "Competitive", href: "/competitive", icon: <TrendingUp className="h-[18px] w-[18px]" /> },
  { label: "Search", href: "/search", icon: <Search className="h-[18px] w-[18px]" /> },
  { label: "Reports", href: "/reports", icon: <FileText className="h-[18px] w-[18px]" /> },
  { label: "Alerts", href: "/alerts", icon: <Bell className="h-[18px] w-[18px]" /> },
  { label: "Publishing", href: "/publishing", icon: <Send className="h-[18px] w-[18px]" /> },
  { label: "Audit", href: "/audit", icon: <ClipboardList className="h-[18px] w-[18px]" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="h-[18px] w-[18px]" /> },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#080c14] text-slate-500 border-r border-white/[0.04]">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/[0.04]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/25">
            <Zap className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-slate-100 tracking-tight">
              KhushFus
            </span>
          )}
        </Link>
        {/* Desktop collapse */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all duration-150"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          />
        </button>
        {/* Mobile close */}
        <button
          onClick={onMobileClose}
          aria-label="Close sidebar"
          className="lg:hidden flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all duration-150"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Project selector */}
      {!collapsed && (
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-300 hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-150"
          >
            <span className="truncate">All Projects</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200",
                projectDropdownOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const hasAccess = user ? canAccessRoute(user.role, item.href) : false;
          if (!hasAccess) return null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              aria-current={isActive ? "page" : undefined}
              role="menuitem"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-indigo-500/[0.12] text-indigo-400 shadow-sm shadow-indigo-500/5"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-white/[0.04] p-3">
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg",
            collapsed && "justify-center px-2",
          )}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/80 to-purple-600/80 text-white text-xs font-semibold shrink-0">
            {user ? getInitials(user.full_name) : "?"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-300 truncate">
                {user?.full_name || "User"}
              </p>
              <p className="text-[11px] text-slate-600 truncate">
                {user?.email || ""}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-all duration-150"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 transition-all duration-300 ease-out",
          collapsed ? "lg:w-[68px]" : "lg:w-[260px]",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
