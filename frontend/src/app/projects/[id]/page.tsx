"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  Hash,
  BarChart3,
  MessageSquare,
  TrendingUp,
  Users,
  Calendar,
  Plus,
  X,
  AlertTriangle,
  Check,
  Loader2,
  Eye,
  Target,
  Play,
  Globe,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useProject, type Project, type ProjectKeyword } from "@/hooks/useProjects";
import { AppShell } from "@/components/layout/AppShell";
import toast from "react-hot-toast";

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  tiktok: "TikTok",
  news: "News & Blogs",
  mastodon: "Mastodon",
  telegram: "Telegram",
};

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

const KEYWORD_TYPE_COLORS: Record<string, string> = {
  brand: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  competitor: "bg-red-500/20 text-red-300 border-red-500/30",
  product: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  campaign: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  topic: "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

const KEYWORD_TYPES = ["brand", "competitor", "product", "campaign", "topic"] as const;

const ALL_PLATFORMS = [
  { id: "twitter", label: "Twitter" },
  { id: "reddit", label: "Reddit" },
  { id: "news", label: "News & Blogs" },
  { id: "youtube", label: "YouTube" },
  { id: "mastodon", label: "Mastodon" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "telegram", label: "Telegram" },
];

type TabKey = "overview" | "keywords" | "settings";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const {
    project,
    isLoading,
    error,
    updateProject,
    addKeyword,
    triggerCollection,
    refetch,
  } = useProject(projectId);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  if (isLoading) {
    return (
      <AppShell title="Project">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell title="Project">
        <div className="flex flex-col items-center justify-center h-64">
          <AlertTriangle className="h-12 w-12 text-slate-600 mb-3" />
          <p className="text-lg font-medium text-slate-300">Project not found</p>
          <Link href="/projects" className="text-sm text-indigo-400 hover:text-indigo-300 mt-2">
            Back to projects
          </Link>
        </div>
      </AppShell>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "keywords", label: "Keywords", icon: Hash },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <AppShell title={project.name}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-100">{project.name}</h1>
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border",
                    STATUS_STYLES[project.status] || STATUS_STYLES.archived
                  )}
                >
                  {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {project.client_name}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-white/[0.06] mb-6">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab project={project} onTriggerCollection={triggerCollection} />
        )}
        {activeTab === "keywords" && (
          <KeywordsTab
            keywords={project.keywords}
            onAdd={addKeyword}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab project={project} onUpdate={updateProject} />
        )}
      </div>
    </AppShell>
  );
}

// ---------- Overview Tab ----------

function OverviewTab({
  project,
  onTriggerCollection,
}: {
  project: Project;
  onTriggerCollection: (hoursBack: number) => Promise<any>;
}) {
  const [isCollecting, setIsCollecting] = useState(false);

  const sentimentLabel =
    project.avg_sentiment > 0.2
      ? "Positive"
      : project.avg_sentiment < -0.2
        ? "Negative"
        : "Neutral";
  const sentimentColor =
    project.avg_sentiment > 0.2
      ? "text-emerald-400"
      : project.avg_sentiment < -0.2
        ? "text-red-400"
        : "text-slate-400";

  async function handleCollect() {
    setIsCollecting(true);
    try {
      await onTriggerCollection(24);
      toast.success("Data collection triggered successfully");
    } catch (err: any) {
      console.error("Failed to trigger collection:", err);
      toast.error("Failed to trigger collection");
    } finally {
      setIsCollecting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Project info */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100 mb-2">Project Information</h2>
            <p className="text-sm text-slate-400 mb-4">
              {project.description || "No description provided."}
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Created {project.created_at ? formatDate(project.created_at) : "---"}
              </span>
              {project.updated_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Updated {formatDate(project.updated_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {project.platforms.map((p) => (
                <span
                  key={p}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center justify-center text-white",
                    PLATFORM_COLORS[p] || "bg-slate-600"
                  )}
                >
                  {PLATFORM_LABELS[p] || p}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={handleCollect}
            disabled={isCollecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors shrink-0"
          >
            {isCollecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Collecting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Trigger Collection
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">
                {formatNumber(project.mention_count)}
              </p>
              <p className="text-xs text-slate-500">Total Mentions</p>
            </div>
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", sentimentColor)}>
                {project.avg_sentiment > 0 ? "+" : ""}
                {project.avg_sentiment.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">Avg Sentiment ({sentimentLabel})</p>
            </div>
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Eye className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">
                {formatNumber(project.total_reach)}
              </p>
              <p className="text-xs text-slate-500">Total Reach</p>
            </div>
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Target className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">
                {project.keywords.filter((k) => k.is_active).length}
              </p>
              <p className="text-xs text-slate-500">Active Keywords</p>
            </div>
          </div>
        </div>
      </div>

      {/* Platforms + Keywords summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-400" />
            Monitored Platforms
          </h3>
          <div className="space-y-2">
            {project.platforms.length === 0 ? (
              <p className="text-sm text-slate-500">No platforms configured.</p>
            ) : (
              project.platforms.map((p) => (
                <div key={p} className="flex items-center gap-3 p-2 bg-white/[0.04] rounded-lg">
                  <span
                    className={cn(
                      "h-7 w-7 rounded text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0",
                      PLATFORM_COLORS[p] || "bg-slate-600"
                    )}
                  >
                    {(PLATFORM_LABELS[p] || p).substring(0, 2)}
                  </span>
                  <span className="text-sm font-medium text-slate-300">
                    {PLATFORM_LABELS[p] || p}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Hash className="h-4 w-4 text-slate-400" />
            Keywords ({project.keywords.length})
          </h3>
          <div className="space-y-2">
            {project.keywords.length === 0 ? (
              <p className="text-sm text-slate-500">No keywords configured.</p>
            ) : (
              project.keywords.slice(0, 8).map((kw) => (
                <div key={kw.id} className="flex items-center gap-3 p-2 bg-white/[0.04] rounded-lg">
                  <span className="text-sm font-medium text-slate-300 flex-1">{kw.term}</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-semibold rounded-full border",
                      KEYWORD_TYPE_COLORS[kw.keyword_type] || "bg-slate-500/20 text-slate-400 border-slate-500/30"
                    )}
                  >
                    {kw.keyword_type}
                  </span>
                </div>
              ))
            )}
            {project.keywords.length > 8 && (
              <p className="text-xs text-slate-500 text-center pt-1">
                +{project.keywords.length - 8} more keywords
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Keywords Tab ----------

function KeywordsTab({
  keywords,
  onAdd,
}: {
  keywords: ProjectKeyword[];
  onAdd: (term: string, keywordType: string) => Promise<any>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newType, setNewType] = useState("brand");
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd() {
    if (!newTerm.trim()) return;
    setIsAdding(true);
    try {
      await onAdd(newTerm.trim(), newType);
      toast.success(`Keyword "${newTerm.trim()}" added`);
      setNewTerm("");
      setShowAdd(false);
    } catch (err: any) {
      console.error("Failed to add keyword:", err);
      toast.error("Failed to add keyword");
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06]">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Keywords</h2>
          <p className="text-sm text-slate-500">
            {keywords.filter((k) => k.is_active).length} active,{" "}
            {keywords.filter((k) => !k.is_active).length} inactive
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Keyword
        </button>
      </div>

      {/* Add keyword inline form */}
      {showAdd && (
        <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Keyword term..."
            className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {KEYWORD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="inline-flex items-center gap-1 px-3 h-9 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Add
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="p-2 text-slate-500 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.03]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Term
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {keywords.map((kw) => (
              <tr key={kw.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-slate-200">{kw.term}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border",
                      KEYWORD_TYPE_COLORS[kw.keyword_type] || "bg-slate-500/20 text-slate-400 border-slate-500/30"
                    )}
                  >
                    {kw.keyword_type.charAt(0).toUpperCase() + kw.keyword_type.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
                      kw.is_active
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-500/15 text-slate-500"
                    )}
                  >
                    {kw.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {keywords.length === 0 && (
        <div className="py-12 text-center text-slate-500">
          <Hash className="h-10 w-10 mx-auto mb-2 text-slate-600" />
          <p>No keywords configured</p>
        </div>
      )}
    </div>
  );
}

// ---------- Settings Tab ----------

function SettingsTab({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (u: Record<string, any>) => Promise<any>;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [platforms, setPlatforms] = useState(project.platforms);
  const [status, setStatus] = useState(project.status);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  function togglePlatform(id: string) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onUpdate({ name, description, platforms, status });
      toast.success("Project updated successfully");
    } catch (err: any) {
      console.error("Failed to update project:", err);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    try {
      await onUpdate({ status: "archived" });
      toast.success("Project archived");
      setShowArchiveConfirm(false);
      router.push("/projects");
    } catch (err: any) {
      toast.error("Failed to archive project");
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit form */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-6">
        <h2 className="text-base font-semibold text-slate-100 mb-4">Project Settings</h2>

        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Platforms</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {ALL_PLATFORMS.map((p) => {
                const selected = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left text-sm",
                      selected
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                        : "border-white/[0.08] text-slate-400 hover:border-slate-600"
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 rounded text-white text-[8px] font-bold inline-flex items-center justify-center",
                        PLATFORM_COLORS[p.id] || "bg-slate-600"
                      )}
                    >
                      {p.label.charAt(0)}
                    </span>
                    <span className="truncate">{p.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 ml-auto text-indigo-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white/[0.03] rounded-xl border border-red-500/30 p-6">
        <h2 className="text-base font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-slate-400 mb-4">
          Archiving a project will stop all monitoring and data collection. This action can be
          reversed by changing the project status.
        </p>

        {showArchiveConfirm ? (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">
              Are you sure you want to archive this project? Monitoring will be paused.
            </p>
            <button
              onClick={handleArchive}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
            >
              Confirm Archive
            </button>
            <button
              onClick={() => setShowArchiveConfirm(false)}
              className="px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] text-slate-300 text-sm rounded-lg hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/10 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Archive Project
          </button>
        )}
      </div>
    </div>
  );
}
