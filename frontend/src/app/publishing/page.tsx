"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Loader2,
  Send,
  Clock,
  Twitter,
  Facebook,
  Linkedin,
  Instagram,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  CalendarDays,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api, type ScheduledPost } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type PostStatus = ScheduledPost["status"];
type Platform = "twitter" | "facebook" | "linkedin" | "instagram";
type ViewMode = "cards" | "calendar";

const ALL_PLATFORMS: Platform[] = ["twitter", "facebook", "linkedin", "instagram"];

const platformIcons: Record<Platform, typeof Twitter> = {
  twitter: Twitter,
  facebook: Facebook,
  linkedin: Linkedin,
  instagram: Instagram,
};

const platformColors: Record<Platform, string> = {
  twitter: "text-sky-400",
  facebook: "text-blue-400",
  linkedin: "text-blue-500",
  instagram: "text-pink-400",
};

/** Color definitions for each workflow status */
const STATUS_STYLES: Record<PostStatus, { badge: string; dot: string; label: string }> = {
  draft:          { badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",     dot: "bg-slate-400",    label: "Draft" },
  pending_review: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",     dot: "bg-amber-400",    label: "Pending Review" },
  approved:       { badge: "bg-teal-500/10 text-teal-400 border-teal-500/20",         dot: "bg-teal-400",     label: "Approved" },
  scheduled:      { badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",         dot: "bg-blue-400",     label: "Scheduled" },
  published:      { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", label: "Published" },
  failed:         { badge: "bg-red-500/10 text-red-400 border-red-500/20",            dot: "bg-red-400",      label: "Failed" },
};

const FILTER_TABS: { key: PostStatus | "all"; label: string }[] = [
  { key: "all",           label: "All" },
  { key: "draft",         label: "Drafts" },
  { key: "pending_review", label: "Pending Review" },
  { key: "approved",      label: "Approved" },
  { key: "scheduled",     label: "Scheduled" },
  { key: "published",     label: "Published" },
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContent(p: ScheduledPost): string {
  return p.content || "";
}

function getPlatforms(p: ScheduledPost): string[] {
  return p.platforms ?? (p.platform ? [p.platform] : []);
}

function getScheduled(p: ScheduledPost): string {
  return p.scheduled_at ?? "";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PostStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        s.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

function PlatformIconList({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex gap-2">
      {platforms.map((pl) => {
        const Icon = platformIcons[pl as Platform];
        return Icon ? (
          <Icon key={pl} className={cn("h-4 w-4", platformColors[pl as Platform] || "text-slate-400")} />
        ) : (
          <span key={pl} className="text-xs text-slate-500 capitalize">{pl}</span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------------

function CalendarView({
  posts,
  onPostClick,
}: {
  posts: ScheduledPost[];
  onPostClick: (post: ScheduledPost) => void;
}) {
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // Build a map of day-of-month -> posts
  const postsByDay = useMemo(() => {
    const map: Record<number, ScheduledPost[]> = {};
    for (const post of posts) {
      const scheduled = getScheduled(post);
      if (!scheduled) continue;
      const d = new Date(scheduled);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(post);
      }
    }
    return map;
  }, [posts, calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;

  // Total cells = leading blanks + days
  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  return (
    <div className="select-none">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-slate-200">
          {MONTH_NAMES[calMonth]} {calYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="grid grid-cols-7 gap-px bg-white/[0.04] rounded-xl overflow-hidden border border-white/[0.06]">
        {Array.from({ length: rows * 7 }).map((_, i) => {
          const day = i - firstDay + 1;
          const inMonth = day >= 1 && day <= daysInMonth;
          const dayPosts = inMonth ? (postsByDay[day] ?? []) : [];

          return (
            <div
              key={i}
              className={cn(
                "min-h-[80px] p-1.5 bg-slate-900/60",
                !inMonth && "opacity-30",
              )}
            >
              {inMonth && (
                <>
                  <div
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday(day)
                        ? "bg-indigo-500 text-white"
                        : "text-slate-400",
                    )}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((post) => {
                      const s = STATUS_STYLES[post.status] ?? STATUS_STYLES.draft;
                      return (
                        <button
                          key={post.id}
                          onClick={() => onPostClick(post)}
                          title={getContent(post)}
                          className={cn(
                            "w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight truncate transition-opacity hover:opacity-80",
                            s.badge,
                            "border-0",
                          )}
                        >
                          {getContent(post).slice(0, 24) || "(no content)"}
                        </button>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <p className="text-[10px] text-slate-500 pl-1">+{dayPosts.length - 3} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post form dialog
// ---------------------------------------------------------------------------

interface PostFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    content: string;
    platforms: Platform[];
    scheduled_at?: string;
    status: PostStatus;
  }) => Promise<void>;
  saving: boolean;
  initialData?: {
    content: string;
    platforms: Platform[];
    scheduled_at?: string;
    status: PostStatus;
  };
  title: string;
}

function PostFormDialog({ open, onClose, onSave, saving, initialData, title }: PostFormDialogProps) {
  const [content, setContent] = useState(initialData?.content ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(initialData?.platforms ?? []);
  const [date, setDate] = useState(() => {
    if (!initialData?.scheduled_at) return "";
    return initialData.scheduled_at.slice(0, 10);
  });
  const [time, setTime] = useState(() => {
    if (!initialData?.scheduled_at) return "";
    return initialData.scheduled_at.slice(11, 16);
  });

  // Sync when initialData changes (edit mode re-open)
  useEffect(() => {
    if (open) {
      setContent(initialData?.content ?? "");
      setPlatforms(initialData?.platforms ?? []);
      setDate(initialData?.scheduled_at ? initialData.scheduled_at.slice(0, 10) : "");
      setTime(initialData?.scheduled_at ? initialData.scheduled_at.slice(11, 16) : "");
    }
  }, [open, initialData]);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleSave = () => {
    onSave({
      content,
      platforms,
      scheduled_at: date && time ? `${date}T${time}:00Z` : undefined,
      status: initialData?.status ?? "draft",
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <span className="text-slate-100">{title}</span>
      </DialogHeader>
      <DialogContent className="space-y-4">
        {/* Platform selector */}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Platforms</label>
          <div className="flex gap-3 flex-wrap">
            {ALL_PLATFORMS.map((p) => {
              const Icon = platformIcons[p];
              const selected = platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    selected
                      ? "border-indigo-500 bg-indigo-500/10 text-slate-200"
                      : "border-white/[0.08] hover:border-slate-600 text-slate-400",
                  )}
                >
                  <Icon className={cn("h-4 w-4", selected ? platformColors[p] : "text-slate-500")} />
                  <span className="capitalize hidden sm:inline">{p}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-1 block">Content</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What would you like to share?"
            rows={4}
            className="resize-none bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
          />
          <div className="text-right mt-1">
            <span className="text-xs text-slate-500">{content.length} characters</span>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-1 block">Schedule (optional)</label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-slate-100"
            />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-slate-100"
            />
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={onClose}
          className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || platforms.length === 0 || !content.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save as Draft
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reject dialog
// ---------------------------------------------------------------------------

function RejectDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <span className="text-slate-100">Reject Post</span>
      </DialogHeader>
      <DialogContent className="space-y-3">
        <p className="text-sm text-slate-400">
          Provide a reason for rejection. The author will see this message.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Needs revised copy, incorrect brand voice…"
          rows={3}
          className="resize-none bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
        />
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={onClose}
          className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
        >
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(reason)}
          disabled={loading || !reason.trim()}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reject
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <span className="text-slate-100">Delete Post</span>
      </DialogHeader>
      <DialogContent>
        <p className="text-sm text-slate-400">
          Are you sure you want to delete this post? This action cannot be undone.
        </p>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={onClose}
          className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PublishingPage() {
  const { user } = useAuth();
  const { projects, isLoading: projectsLoading } = useProjects();

  const canManage = hasPermission(user?.role, "publishing.manage");

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // View / filter state
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [activeFilter, setActiveFilter] = useState<PostStatus | "all">("all");

  // Create / edit dialog
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [savingPost, setSavingPost] = useState(false);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<ScheduledPost | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ScheduledPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Action loading per-post (for approve / submit-review buttons)
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Load posts
  const fetchPosts = useCallback(async (projectId: number) => {
    setPostsLoading(true);
    try {
      const data = await api.getScheduledPosts(projectId);
      setPosts(data ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) fetchPosts(selectedProjectId);
  }, [selectedProjectId, fetchPosts]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    if (activeFilter === "all") return posts;
    return posts.filter((p) => p.status === activeFilter);
  }, [posts, activeFilter]);

  // Filter tab counts
  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { all: posts.length };
    for (const p of posts) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return counts;
  }, [posts]);

  // ---------------------------------------------------------------------------
  // Optimistic state update helpers
  // ---------------------------------------------------------------------------

  const updatePostInState = (updated: ScheduledPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const removePostFromState = (id: number | string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Create / Edit
  // ---------------------------------------------------------------------------

  const handleOpenCreate = () => {
    setEditingPost(null);
    setPostDialogOpen(true);
  };

  const handleOpenEdit = (post: ScheduledPost) => {
    setEditingPost(post);
    setPostDialogOpen(true);
  };

  const handleSavePost = async (data: {
    content: string;
    platforms: Platform[];
    scheduled_at?: string;
    status: PostStatus;
  }) => {
    setSavingPost(true);
    try {
      if (editingPost) {
        const updated = await api.updatePost(editingPost.id as number, {
          content: data.content,
          platforms: data.platforms,
          scheduled_at: data.scheduled_at,
        });
        updatePostInState(updated);
        toast.success("Post updated");
      } else {
        await api.createPost({
          project_id: selectedProjectId,
          content: data.content,
          platforms: data.platforms,
          scheduled_at: data.scheduled_at,
          status: "draft",
        });
        toast.success("Draft saved");
        if (selectedProjectId) fetchPosts(selectedProjectId);
      }
      setPostDialogOpen(false);
      setEditingPost(null);
    } catch {
      toast.error(editingPost ? "Failed to update post" : "Failed to create post");
    } finally {
      setSavingPost(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Workflow actions
  // ---------------------------------------------------------------------------

  const handleSubmitForReview = async (post: ScheduledPost) => {
    setActionLoading(post.id);
    try {
      const updated = await api.updatePost(post.id as number, { status: "pending_review" });
      updatePostInState(updated);
      toast.success("Submitted for review");
    } catch {
      toast.error("Failed to submit for review");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (post: ScheduledPost) => {
    setActionLoading(post.id);
    try {
      // Approve → auto-schedule if a scheduled_at is set, otherwise mark approved
      const newStatus: PostStatus = getScheduled(post) ? "scheduled" : "approved";
      const updated = await api.updatePost(post.id as number, { status: newStatus });
      updatePostInState(updated);
      toast.success(newStatus === "scheduled" ? "Post approved and scheduled" : "Post approved");
    } catch {
      toast.error("Failed to approve post");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      const updated = await api.updatePost(rejectTarget.id as number, {
        status: "draft",
        rejection_reason: reason,
      });
      updatePostInState(updated);
      toast.success("Post rejected and returned to draft");
      setRejectTarget(null);
    } catch {
      toast.error("Failed to reject post");
    } finally {
      setRejecting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deletePost(deleteTarget.id as number);
      removePostFromState(deleteTarget.id);
      toast.success("Post deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete post");
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell title="Publishing">
      <div className="space-y-6">
        {/* ── Top bar ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-64">
            {projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
              </div>
            ) : projects.length > 0 ? (
              <Select
                value={String(selectedProjectId ?? "")}
                onValueChange={(v) => setSelectedProjectId(Number(v))}
                className="bg-[#111827]/70 border-white/[0.08] text-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-slate-500">No projects found</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "cards"
                    ? "bg-white/[0.08] text-slate-200"
                    : "text-slate-500 hover:text-slate-300",
                )}
                aria-label="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "calendar"
                    ? "bg-white/[0.08] text-slate-200"
                    : "text-slate-500 hover:text-slate-300",
                )}
                aria-label="Calendar view"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </button>
            </div>

            <Button
              onClick={handleOpenCreate}
              disabled={!selectedProjectId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Post
            </Button>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeFilter === tab.key
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                  : "text-slate-400 hover:text-slate-300 hover:bg-white/[0.04]",
              )}
            >
              {tab.label}
              {countByStatus[tab.key] !== undefined && countByStatus[tab.key] > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    activeFilter === tab.key
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "bg-white/[0.06] text-slate-500",
                  )}
                >
                  {countByStatus[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content area ── */}
        <Card>
          <CardHeader className="border-white/[0.06]">
            <CardTitle className="text-slate-100">
              {viewMode === "calendar" ? "Content Calendar" : "Posts"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : viewMode === "calendar" ? (
              /* ── Calendar view ── */
              <CalendarView
                posts={activeFilter === "all" ? posts : filteredPosts}
                onPostClick={handleOpenEdit}
              />
            ) : filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Send className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">
                  {activeFilter === "all"
                    ? "No posts yet"
                    : `No ${STATUS_STYLES[activeFilter as PostStatus]?.label ?? activeFilter} posts`}
                </p>
                {activeFilter === "all" && (
                  <p className="text-xs text-slate-600 mt-1">
                    Click &quot;New Post&quot; to schedule content across platforms.
                  </p>
                )}
              </div>
            ) : (
              /* ── Card view ── */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    canManage={canManage}
                    actionLoading={actionLoading}
                    onEdit={handleOpenEdit}
                    onDelete={(p) => setDeleteTarget(p)}
                    onSubmitForReview={handleSubmitForReview}
                    onApprove={handleApprove}
                    onReject={(p) => setRejectTarget(p)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs ── */}
      <PostFormDialog
        open={postDialogOpen}
        onClose={() => { setPostDialogOpen(false); setEditingPost(null); }}
        onSave={handleSavePost}
        saving={savingPost}
        title={editingPost ? "Edit Post" : "New Post"}
        initialData={
          editingPost
            ? {
                content: getContent(editingPost),
                platforms: getPlatforms(editingPost) as Platform[],
                scheduled_at: getScheduled(editingPost) || undefined,
                status: editingPost.status,
              }
            : undefined
        }
      />

      <RejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        loading={rejecting}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// PostCard — extracted to keep main component readable
// ---------------------------------------------------------------------------

interface PostCardProps {
  post: ScheduledPost;
  canManage: boolean;
  actionLoading: number | string | null;
  onEdit: (p: ScheduledPost) => void;
  onDelete: (p: ScheduledPost) => void;
  onSubmitForReview: (p: ScheduledPost) => void;
  onApprove: (p: ScheduledPost) => void;
  onReject: (p: ScheduledPost) => void;
}

function PostCard({
  post,
  canManage,
  actionLoading,
  onEdit,
  onDelete,
  onSubmitForReview,
  onApprove,
  onReject,
}: PostCardProps) {
  const isLoading = actionLoading === post.id;
  const platforms = getPlatforms(post);
  const scheduled = getScheduled(post);

  return (
    <div className="group rounded-lg border border-white/[0.06] bg-white/[0.04] p-4 space-y-3 hover:border-white/[0.10] transition-colors">
      {/* Row 1: platforms + status + edit/delete */}
      <div className="flex items-start justify-between gap-2">
        <PlatformIconList platforms={platforms} />
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={post.status} />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {(post.status === "draft" || post.status === "pending_review" || post.status === "approved") && (
              <button
                onClick={() => onEdit(post)}
                className="rounded p-1 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Edit post"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(post)}
              className="rounded p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Delete post"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-slate-300 line-clamp-3">
        {getContent(post) || "(no content)"}
      </p>

      {/* Rejection reason */}
      {post.rejection_reason && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs text-red-400">
            <span className="font-medium">Rejected:</span> {post.rejection_reason}
          </p>
        </div>
      )}

      {/* Timestamps */}
      {scheduled && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Scheduled: {formatDate(scheduled)}
        </div>
      )}

      {/* ── Workflow action buttons ── */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {/* Draft → submit for review */}
        {post.status === "draft" && (
          <Button
            size="sm"
            onClick={() => onSubmitForReview(post)}
            disabled={isLoading}
            className="h-7 px-3 text-xs bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Submit for Review
          </Button>
        )}

        {/* Pending review → approve / reject (managers+ only) */}
        {post.status === "pending_review" && canManage && (
          <>
            <Button
              size="sm"
              onClick={() => onApprove(post)}
              disabled={isLoading}
              className="h-7 px-3 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Approve
            </Button>
            <Button
              size="sm"
              onClick={() => onReject(post)}
              disabled={isLoading}
              className="h-7 px-3 text-xs bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </>
        )}

        {/* Pending review — read-only label for non-managers */}
        {post.status === "pending_review" && !canManage && (
          <span className="text-xs text-slate-500 italic">Awaiting manager review</span>
        )}
      </div>
    </div>
  );
}
