"use client";

import { useState } from "react";
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

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Tw",
  instagram: "Ig",
  facebook: "Fb",
  linkedin: "Li",
  youtube: "Yt",
  reddit: "Rd",
  tiktok: "Tk",
  news: "Nw",
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-sky-500",
  instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
  facebook: "bg-blue-600",
  linkedin: "bg-blue-700",
  youtube: "bg-red-600",
  reddit: "bg-orange-500",
  tiktok: "bg-gray-900",
  news: "bg-emerald-600",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused: "bg-yellow-100 text-yellow-800 border-yellow-200",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function ProjectsPage() {
  const { projects, isLoading } = useProjects();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your social listening projects and keyword groups
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
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
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <FolderOpen className="h-16 w-16 mb-4" />
            <p className="text-lg font-medium text-gray-600">No projects yet</p>
            <p className="text-sm text-gray-400 mb-4">
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
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Users className="h-3.5 w-3.5" />
                      {project.client_name}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border shrink-0 ml-2",
                      STATUS_STYLES[project.status]
                    )}
                  >
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                  </span>
                </div>

                {/* Platforms */}
                <div className="flex items-center gap-1 mb-4">
                  {project.platforms.map((p) => (
                    <span
                      key={p}
                      className={cn(
                        "h-6 w-6 rounded text-white text-[9px] font-bold inline-flex items-center justify-center",
                        PLATFORM_COLORS[p] || "bg-gray-500"
                      )}
                      title={p}
                    >
                      {PLATFORM_LABELS[p] || p.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatNumber(project.mention_count)}
                      </p>
                      <p className="text-[10px] text-gray-500">Mentions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <Hash className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {project.keywords.length}
                      </p>
                      <p className="text-[10px] text-gray-500">Keywords</p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(project.created_at)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
