"use client";

import Link from "next/link";
import {
  Plus,
  FolderOpen,
  Users,
  Hash,
  MessageSquare,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-[#1DA1F2]",
  reddit: "bg-[#FF4500]",
  news: "bg-indigo-500",
  youtube: "bg-[#FF0000]",
  mastodon: "bg-[#6364FF]",
  instagram: "bg-[#E4405F]",
  facebook: "bg-[#1877F2]",
  linkedin: "bg-[#0A66C2]",
  tiktok: "bg-slate-300 text-slate-900",
  telegram: "bg-[#26A5E4]",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  archived: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export default function ProjectsPage() {
  const { projects, isLoading } = useProjects();

  return (
    <AppShell title="Projects">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-slate-400 mt-1">
              Manage your social listening projects and keyword groups
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <FolderOpen className="h-16 w-16 mb-4 text-slate-600" />
            <p className="text-lg font-medium text-slate-300">No projects yet</p>
            <p className="text-sm text-slate-500 mb-4">
              Create your first project to start monitoring
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Create Project
            </Link>
          </div>
        ) : (
          /* Project Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group bg-slate-900/60 rounded-xl border border-slate-800 p-6 hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors truncate">
                      {project.name}
                    </h3>
                    <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                      <Users className="h-3.5 w-3.5" />
                      {project.client_name}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border shrink-0 ml-2",
                      STATUS_STYLES[project.status] || STATUS_STYLES.archived
                    )}
                  >
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                  </span>
                </div>

                {/* Platforms */}
                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                  {project.platforms.map((p) => (
                    <span
                      key={p}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center justify-center text-white",
                        PLATFORM_COLORS[p] || "bg-slate-600"
                      )}
                    >
                      {p}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 p-2 bg-slate-800/60 rounded-lg">
                    <MessageSquare className="h-4 w-4 text-indigo-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {formatNumber(project.mention_count)}
                      </p>
                      <p className="text-[10px] text-slate-500">Mentions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-800/60 rounded-lg">
                    <Hash className="h-4 w-4 text-indigo-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {project.keywords.length}
                      </p>
                      <p className="text-[10px] text-slate-500">Keywords</p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {project.created_at ? formatDate(project.created_at) : "---"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
