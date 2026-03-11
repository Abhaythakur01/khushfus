"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Loader2,
  Send,
  Clock,
  FolderOpen,
  Twitter,
  Facebook,
  Linkedin,
  Instagram,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
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

interface Project {
  id: number;
  name: string;
}

interface Post {
  id: number | string;
  content?: string;
  text?: string;
  platforms?: string[];
  platform?: string;
  status?: string;
  scheduled_at?: string;
  scheduledAt?: string;
  published_at?: string;
  publishedAt?: string;
  created_at?: string;
}

type Platform = "twitter" | "facebook" | "linkedin" | "instagram";

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

const statusColor = (s: string) => {
  switch (s) {
    case "scheduled":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "published":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "failed":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "draft":
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
};

export default function PublishingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formContent, setFormContent] = useState("");
  const [formPlatforms, setFormPlatforms] = useState<Platform[]>([]);
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");

  // Load projects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getProjects();
        if (cancelled) return;
        setProjects(list ?? []);
        if (list?.length > 0) setSelectedProjectId(list[0].id);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    if (selectedProjectId) {
      fetchPosts(selectedProjectId);
    }
  }, [selectedProjectId, fetchPosts]);

  const togglePlatform = (p: Platform) => {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const resetForm = () => {
    setFormContent("");
    setFormPlatforms([]);
    setFormDate("");
    setFormTime("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.createPost({
        project_id: selectedProjectId,
        content: formContent,
        platforms: formPlatforms,
        scheduled_at: formDate && formTime ? `${formDate}T${formTime}:00Z` : undefined,
      });
      toast.success("Post created");
      setDialogOpen(false);
      resetForm();
      if (selectedProjectId) fetchPosts(selectedProjectId);
    } catch (err: any) {
      console.error("Failed to create post:", err);
      toast.error("Failed to create post");
    } finally {
      setCreating(false);
    }
  };

  const getContent = (p: Post) => p.content || p.text || "";
  const getPlatforms = (p: Post): string[] => p.platforms || (p.platform ? [p.platform] : []);
  const getScheduled = (p: Post) => p.scheduled_at || p.scheduledAt || "";
  const getPublished = (p: Post) => p.published_at || p.publishedAt || "";

  return (
    <AppShell title="Publishing">
      <div className="space-y-6">
        {/* Top bar */}
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
                className="bg-slate-900 border-slate-700 text-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-slate-500">No projects found</p>
            )}
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!selectedProjectId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        </div>

        {/* Posts list */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="border-slate-800">
            <CardTitle className="text-slate-100">Scheduled Posts</CardTitle>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Send className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No posts scheduled</p>
                <p className="text-xs text-slate-600 mt-1">
                  Click &quot;New Post&quot; to schedule content across platforms.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-lg border border-slate-800 bg-slate-800/40 p-4 space-y-3"
                  >
                    {/* Platform icons + status */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        {getPlatforms(post).map((pl) => {
                          const Icon = platformIcons[pl as Platform];
                          return Icon ? (
                            <Icon
                              key={pl}
                              className={cn("h-4 w-4", platformColors[pl as Platform] || "text-slate-400")}
                            />
                          ) : (
                            <span key={pl} className="text-xs text-slate-500 capitalize">{pl}</span>
                          );
                        })}
                      </div>
                      <Badge className={cn("capitalize border", statusColor(post.status || "draft"))}>
                        {post.status || "draft"}
                      </Badge>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-slate-300 line-clamp-3">
                      {getContent(post) || "(no content)"}
                    </p>

                    {/* Timestamps */}
                    {getScheduled(post) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Scheduled: {formatDate(getScheduled(post))}
                      </div>
                    )}
                    {getPublished(post) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Published: {formatDate(getPublished(post))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Post Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="bg-slate-900 border border-slate-700">
        <DialogHeader onClose={() => setDialogOpen(false)} className="border-slate-700">
          <span className="text-slate-100">New Post</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          {/* Platform selector */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Platforms</label>
            <div className="flex gap-3">
              {(["twitter", "facebook", "linkedin", "instagram"] as Platform[]).map((p) => {
                const Icon = platformIcons[p];
                const selected = formPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      selected
                        ? "border-indigo-500 bg-indigo-500/10 text-slate-200"
                        : "border-slate-700 hover:border-slate-600 text-slate-400"
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
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="What would you like to share?"
              rows={4}
              className="resize-none bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
            />
            <div className="text-right mt-1">
              <span className="text-xs text-slate-500">{formContent.length} characters</span>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Schedule (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
              <Input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter className="border-slate-700 bg-slate-900/50">
          <Button
            variant="outline"
            onClick={() => { resetForm(); setDialogOpen(false); }}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || formPlatforms.length === 0 || !formContent}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {formDate && formTime ? "Schedule" : "Post Now"}
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}
