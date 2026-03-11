"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
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
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Mentions", href: "/mentions", icon: <MessageSquare className="h-5 w-5" /> },
  { label: "Projects", href: "/projects", icon: <FolderKanban className="h-5 w-5" /> },
  { label: "Analytics", href: "/analytics", icon: <BarChart3 className="h-5 w-5" /> },
  { label: "Competitive", href: "/competitive", icon: <TrendingUp className="h-5 w-5" /> },
  { label: "Search", href: "/search", icon: <Search className="h-5 w-5" /> },
  { label: "Reports", href: "/reports", icon: <FileText className="h-5 w-5" /> },
  { label: "Alerts", href: "/alerts", icon: <Bell className="h-5 w-5" /> },
  { label: "Publishing", href: "/publishing", icon: <Send className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="h-5 w-5" /> },
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
    <div className="flex flex-col h-full bg-sidebar-bg text-sidebar-text">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 text-white">
            <Zap className="h-4.5 w-4.5" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-white tracking-tight">
              KhushFus
            </span>
          )}
        </Link>
        {/* Desktop collapse */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
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
          className="lg:hidden flex items-center justify-center w-7 h-7 rounded-md text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Project selector */}
      {!collapsed && (
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-sidebar-hover text-sm text-sidebar-text-active hover:bg-sidebar-active transition-colors"
          >
            <span className="truncate">All Projects</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                projectDropdownOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary-600/20 text-primary-400"
                  : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover",
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
      <div className="border-t border-white/5 p-3">
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg",
            collapsed && "justify-center px-2",
          )}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-semibold shrink-0">
            {user ? getInitials(user.full_name) : "?"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-text-active truncate">
                {user?.full_name || "User"}
              </p>
              <p className="text-xs text-sidebar-text truncate">
                {user?.email || ""}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-md text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 transition-all duration-200",
          collapsed ? "lg:w-16" : "lg:w-64",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
