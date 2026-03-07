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
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Check,
  Loader2,
  Eye,
  Globe,
  Target,
} from "lucide-react";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { useProject, type ProjectKeyword } from "@/hooks/useProjects";

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  tiktok: "TikTok",
  news: "News & Blogs",
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

const KEYWORD_TYPE_COLORS: Record<string, string> = {
  brand: "bg-indigo-100 text-indigo-700 border-indigo-200",
  competitor: "bg-red-100 text-red-700 border-red-200",
  product: "bg-emerald-100 text-emerald-700 border-emerald-200",
  campaign: "bg-amber-100 text-amber-700 border-amber-200",
  topic: "bg-violet-100 text-violet-700 border-violet-200",
};

const KEYWORD_TYPES = ["brand", "competitor", "product", "campaign", "topic"] as const;

const ALL_PLATFORMS = [
  { id: "twitter", label: "Twitter" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "reddit", label: "Reddit" },
  { id: "tiktok", label: "TikTok" },
  { id: "news", label: "News & Blogs" },
];

// Mock recent mentions for overview
const RECENT_MENTIONS = [
  { id: 1, text: "Loving the new NovaBrand serum! Skin feels amazing.", platform: "twitter", sentiment: "positive", time: "2h ago" },
  { id: 2, text: "NovaBrand customer service needs improvement. Waited 3 days for a reply.", platform: "reddit", sentiment: "negative", time: "4h ago" },
  { id: 3, text: "Comparing NovaBrand vs GlowCo moisturizers - full review coming soon!", platform: "youtube", sentiment: "neutral", time: "6h ago" },
  { id: 4, text: "The NovaBrand pop-up in NYC was incredible! So many free samples.", platform: "instagram", sentiment: "positive", time: "8h ago" },
  { id: 5, text: "Anyone else notice NovaBrand raised their prices again?", platform: "twitter", sentiment: "negative", time: "12h ago" },
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
    removeKeyword,
    toggleKeywordStatus,
  } = useProject(projectId);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <AlertTriangle className="h-12 w-12 text-gray-400 mb-3" />
        <p className="text-lg font-medium text-gray-600">Project not found</p>
        <Link href="/projects" className="text-sm text-indigo-600 hover:text-indigo-700 mt-2">
          Back to projects
        </Link>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "keywords", label: "Keywords", icon: Hash },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border",
                    STATUS_STYLES[project.status]
                  )}
                >
                  {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{project.client_name}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === "overview" && <OverviewTab project={project} />}
        {activeTab === "keywords" && (
          <KeywordsTab
            keywords={project.keywords}
            onAdd={addKeyword}
            onRemove={removeKeyword}
            onToggle={toggleKeywordStatus}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab project={project} onUpdate={updateProject} />
        )}
      </div>
    </div>
  );
}

// ---------- Overview Tab ----------

function OverviewTab({ project }: { project: ReturnType<typeof useProject>["project"] & {} }) {
  const sentimentLabel =
    project.avg_sentiment > 0.2
      ? "Positive"
      : project.avg_sentiment < -0.2
        ? "Negative"
        : "Neutral";
  const sentimentColor =
    project.avg_sentiment > 0.2
      ? "text-emerald-600"
      : project.avg_sentiment < -0.2
        ? "text-red-600"
        : "text-gray-600";

  return (
    <div className="space-y-6">
      {/* Project info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Project Information</h2>
        <p className="text-sm text-gray-600 mb-4">{project.description}</p>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Created {formatDate(project.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Updated {formatDate(project.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          {project.platforms.map((p) => (
            <span
              key={p}
              className={cn(
                "h-6 px-2 rounded text-white text-[10px] font-bold inline-flex items-center justify-center",
                PLATFORM_COLORS[p] || "bg-gray-500"
              )}
            >
              {PLATFORM_LABELS[p] || p}
            </span>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(project.mention_count)}
              </p>
              <p className="text-xs text-gray-500">Total Mentions</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", sentimentColor)}>
                {project.avg_sentiment > 0 ? "+" : ""}
                {project.avg_sentiment.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Avg Sentiment ({sentimentLabel})</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
              <Eye className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(project.total_reach)}
              </p>
              <p className="text-xs text-gray-500">Total Reach</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {project.keywords.filter((k) => k.status === "active").length}
              </p>
              <p className="text-xs text-gray-500">Active Keywords</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity chart placeholder + recent mentions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Mention Activity (7 days)</h3>
          <div className="h-48 flex items-end gap-2 px-2">
            {[65, 42, 78, 55, 91, 68, 84].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-indigo-500 rounded-t-md transition-all hover:bg-indigo-600"
                  style={{ height: `${(v / 100) * 160}px` }}
                />
                <span className="text-[10px] text-gray-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Mentions</h3>
          <div className="space-y-3">
            {RECENT_MENTIONS.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded text-white text-[8px] font-bold inline-flex items-center justify-center shrink-0 mt-0.5",
                    PLATFORM_COLORS[m.platform] || "bg-gray-500"
                  )}
                >
                  {(PLATFORM_LABELS[m.platform] || m.platform).charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 line-clamp-2">{m.text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        m.sentiment === "positive"
                          ? "bg-emerald-100 text-emerald-700"
                          : m.sentiment === "negative"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {m.sentiment}
                    </span>
                    <span className="text-[10px] text-gray-400">{m.time}</span>
                  </div>
                </div>
              </div>
            ))}
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
  onRemove,
  onToggle,
}: {
  keywords: ProjectKeyword[];
  onAdd: (kw: Omit<ProjectKeyword, "id">) => void;
  onRemove: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newType, setNewType] = useState<ProjectKeyword["type"]>("brand");

  function handleAdd() {
    if (!newTerm.trim()) return;
    onAdd({ term: newTerm.trim(), type: newType, status: "active" });
    setNewTerm("");
    setShowAdd(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Keywords</h2>
          <p className="text-sm text-gray-500">
            {keywords.filter((k) => k.status === "active").length} active,{" "}
            {keywords.filter((k) => k.status === "inactive").length} inactive
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
        <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Keyword term..."
            className="flex-1 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as ProjectKeyword["type"])}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          >
            {KEYWORD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 px-3 h-9 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            <Check className="h-4 w-4" /> Add
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Term
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keywords.map((kw) => (
              <tr key={kw.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-gray-900">{kw.term}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border",
                      KEYWORD_TYPE_COLORS[kw.type]
                    )}
                  >
                    {kw.type.charAt(0).toUpperCase() + kw.type.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
                      kw.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {kw.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onToggle(kw.id)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title={kw.status === "active" ? "Deactivate" : "Activate"}
                    >
                      {kw.status === "active" ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemove(kw.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {keywords.length === 0 && (
        <div className="py-12 text-center text-gray-400">
          <Hash className="h-10 w-10 mx-auto mb-2" />
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
  project: NonNullable<ReturnType<typeof useProject>["project"]>;
  onUpdate: (u: Partial<typeof project>) => void;
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
    await new Promise((r) => setTimeout(r, 800));
    onUpdate({ name, description, platforms, status });
    setIsSaving(false);
  }

  async function handleArchive() {
    onUpdate({ status: "archived" });
    setShowArchiveConfirm(false);
    router.push("/projects");
  }

  return (
    <div className="space-y-6">
      {/* Edit form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Project Settings</h2>

        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 rounded text-white text-[8px] font-bold inline-flex items-center justify-center",
                        PLATFORM_COLORS[p.id] || "bg-gray-500"
                      )}
                    >
                      {p.label.charAt(0)}
                    </span>
                    {p.label}
                    {selected && <Check className="h-3.5 w-3.5 ml-auto text-indigo-600" />}
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
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-4">
          Archiving a project will stop all monitoring and data collection. This action can be
          reversed by changing the project status.
        </p>

        {showArchiveConfirm ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 flex-1">
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
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Archive Project
          </button>
        )}
      </div>
    </div>
  );
}
