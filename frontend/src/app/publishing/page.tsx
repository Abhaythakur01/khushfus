"use client";

import { useState } from "react";
import {
  Plus,
  Twitter,
  Facebook,
  Linkedin,
  Instagram,
  Heart,
  Share2,
  MessageCircle,
  Edit2,
  Trash2,
  RefreshCw,
  Smile,
  Image,
  Clock,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Platform = "twitter" | "facebook" | "linkedin" | "instagram";
type PostStatus = "scheduled" | "published" | "failed" | "draft";

interface Post {
  id: string;
  platforms: Platform[];
  content: string;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  engagement?: { likes: number; shares: number; comments: number };
  replyToMention?: string;
}

const platformIcons: Record<Platform, typeof Twitter> = {
  twitter: Twitter,
  facebook: Facebook,
  linkedin: Linkedin,
  instagram: Instagram,
};

const platformLimits: Record<Platform, number> = {
  twitter: 280,
  facebook: 63206,
  linkedin: 3000,
  instagram: 2200,
};

const platformColors: Record<Platform, string> = {
  twitter: "text-sky-500",
  facebook: "text-blue-600",
  linkedin: "text-blue-700",
  instagram: "text-pink-500",
};

const statusStyles: Record<PostStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const mockPosts: Post[] = [
  { id: "1", platforms: ["twitter", "linkedin"], content: "Excited to announce our new AI-powered sentiment analysis features! Track brand perception in real-time across all major platforms. #SentimentAnalysis #BrandMonitoring", status: "published", publishedAt: "2026-03-06T14:00:00Z", engagement: { likes: 142, shares: 38, comments: 12 } },
  { id: "2", platforms: ["twitter"], content: "Join us for a live webinar on social listening best practices this Thursday at 2pm EST. Register now at khushfus.io/webinar", status: "scheduled", scheduledAt: "2026-03-10T19:00:00Z" },
  { id: "3", platforms: ["facebook", "instagram"], content: "Behind the scenes at KhushFus HQ! Our data science team is working on next-gen NLP models to improve sentiment accuracy by 40%. Stay tuned for updates!", status: "published", publishedAt: "2026-03-05T10:00:00Z", engagement: { likes: 289, shares: 67, comments: 23 } },
  { id: "4", platforms: ["linkedin"], content: "We're hiring! Looking for Senior ML Engineers to join our growing team. If you're passionate about NLP and social analytics, we'd love to hear from you.", status: "scheduled", scheduledAt: "2026-03-08T15:00:00Z" },
  { id: "5", platforms: ["twitter"], content: "Thanks for the feedback on our latest update. We hear you and improvements are on the way!", status: "failed", scheduledAt: "2026-03-04T09:00:00Z" },
  { id: "6", platforms: ["twitter", "facebook", "linkedin"], content: "KhushFus Q1 2026 Product Update: New dashboard widgets, improved alert system, and 15 new integrations. Read the full changelog on our blog.", status: "draft" },
  { id: "7", platforms: ["instagram"], content: "Data visualization is an art. Here's how our customers turn social data into actionable insights. Swipe to see examples!", status: "draft" },
  { id: "8", platforms: ["twitter"], content: "Quick tip: Set up volume spike alerts to catch trending conversations about your brand early. Prevention > reaction. #SocialListening", status: "published", publishedAt: "2026-03-03T16:30:00Z", engagement: { likes: 87, shares: 29, comments: 5 } },
  { id: "9", platforms: ["facebook"], content: "Case study: How TechCorp used KhushFus to reduce response time to negative mentions by 73% and improve customer satisfaction scores.", status: "scheduled", scheduledAt: "2026-03-09T12:00:00Z" },
  { id: "10", platforms: ["twitter", "linkedin"], content: "Monthly industry report: Social media sentiment trends in the tech sector for February 2026. Download free at khushfus.io/reports", status: "published", publishedAt: "2026-03-01T09:00:00Z", engagement: { likes: 203, shares: 91, comments: 17 } },
];

export default function PublishingPage() {
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [activeTab, setActiveTab] = useState("scheduled");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formPlatforms, setFormPlatforms] = useState<Platform[]>([]);
  const [formContent, setFormContent] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formReplyToggle, setFormReplyToggle] = useState(false);
  const [formMentionId, setFormMentionId] = useState("");

  const togglePlatform = (p: Platform) => {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const minCharLimit = formPlatforms.length
    ? Math.min(...formPlatforms.map((p) => platformLimits[p]))
    : 280;

  const handleSchedule = () => {
    const newPost: Post = {
      id: String(Date.now()),
      platforms: formPlatforms,
      content: formContent,
      status: "scheduled",
      scheduledAt: formDate && formTime ? `${formDate}T${formTime}:00Z` : undefined,
      replyToMention: formReplyToggle ? formMentionId : undefined,
    };
    setPosts((prev) => [newPost, ...prev]);
    resetForm();
    setDialogOpen(false);
  };

  const handleSaveDraft = () => {
    const newPost: Post = {
      id: String(Date.now()),
      platforms: formPlatforms,
      content: formContent,
      status: "draft",
      replyToMention: formReplyToggle ? formMentionId : undefined,
    };
    setPosts((prev) => [newPost, ...prev]);
    resetForm();
    setDialogOpen(false);
  };

  const resetForm = () => {
    setFormPlatforms([]);
    setFormContent("");
    setFormDate("");
    setFormTime("");
    setFormReplyToggle(false);
    setFormMentionId("");
  };

  const deletePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const retryPost = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "scheduled" as PostStatus } : p))
    );
  };

  const filteredPosts = posts.filter((p) => {
    if (activeTab === "scheduled") return p.status === "scheduled";
    if (activeTab === "published") return p.status === "published";
    if (activeTab === "drafts") return p.status === "draft";
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Publishing</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage social media posts across platforms.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Post
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scheduled">
            Scheduled ({posts.filter((p) => p.status === "scheduled").length})
          </TabsTrigger>
          <TabsTrigger value="published">
            Published ({posts.filter((p) => p.status === "published").length})
          </TabsTrigger>
          <TabsTrigger value="drafts">
            Drafts ({posts.filter((p) => p.status === "draft").length})
          </TabsTrigger>
        </TabsList>

        {["scheduled", "published", "drafts"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            {filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No {tab} posts yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPosts.map((post) => (
                  <Card key={post.id}>
                    <CardContent className="pt-6">
                      {/* Platform icons + status */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-2">
                          {post.platforms.map((p) => {
                            const Icon = platformIcons[p];
                            return (
                              <Icon
                                key={p}
                                className={cn("h-4 w-4", platformColors[p])}
                              />
                            );
                          })}
                        </div>
                        <Badge className={cn("capitalize", statusStyles[post.status])}>
                          {post.status}
                        </Badge>
                      </div>

                      {/* Content preview */}
                      <p className="text-sm mb-3 line-clamp-3">
                        {post.content.length > 100
                          ? post.content.slice(0, 100) + "..."
                          : post.content}
                      </p>

                      {/* Timestamp */}
                      {post.scheduledAt && post.status === "scheduled" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                          <Clock className="h-3.5 w-3.5" />
                          Scheduled: {formatDate(post.scheduledAt)}
                        </div>
                      )}
                      {post.publishedAt && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                          <Clock className="h-3.5 w-3.5" />
                          Published: {formatDate(post.publishedAt)}
                        </div>
                      )}

                      {/* Engagement metrics */}
                      {post.engagement && (
                        <div className="flex gap-4 text-xs text-muted-foreground mb-3 pt-2 border-t">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {post.engagement.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3.5 w-3.5" />
                            {post.engagement.shares}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {post.engagement.comments}
                          </span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        {(post.status === "scheduled" || post.status === "draft") && (
                          <Button variant="ghost" size="sm" title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePost(post.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                        {post.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retryPost(post.id)}
                            title="Retry"
                          >
                            <RefreshCw className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* New Post Dialog */}
      {dialogOpen && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-lg mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">New Post</h2>

              <div className="space-y-4">
                {/* Platform selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Platforms</label>
                  <div className="flex gap-3">
                    {(["twitter", "facebook", "linkedin", "instagram"] as Platform[]).map(
                      (p) => {
                        const Icon = platformIcons[p];
                        const selected = formPlatforms.includes(p);
                        return (
                          <button
                            key={p}
                            onClick={() => togglePlatform(p)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <Icon className={cn("h-4 w-4", platformColors[p])} />
                            <span className="capitalize hidden sm:inline">{p}</span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Content</label>
                  <Textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="What would you like to share?"
                    rows={4}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" title="Emoji picker">
                        <Smile className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Add media">
                        <Image className="h-4 w-4" />
                      </Button>
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        formContent.length > minCharLimit
                          ? "text-red-500"
                          : "text-muted-foreground"
                      )}
                    >
                      {formContent.length}/{minCharLimit}
                      {formPlatforms.length > 0 && (
                        <span className="ml-1">
                          ({formPlatforms.map((p) => `${p}: ${platformLimits[p]}`).join(", ")})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Schedule */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Schedule</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Reply to mention */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formReplyToggle}
                      onChange={(e) => setFormReplyToggle(e.target.checked)}
                      className="h-4 w-4 accent-primary rounded"
                    />
                    <span className="text-sm font-medium">Reply to mention</span>
                  </label>
                  {formReplyToggle && (
                    <Input
                      className="mt-2"
                      value={formMentionId}
                      onChange={(e) => setFormMentionId(e.target.value)}
                      placeholder="Mention ID"
                    />
                  )}
                </div>

                {/* Preview */}
                {formPlatforms.length > 0 && formContent && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Preview</label>
                    <div className="space-y-2">
                      {formPlatforms.map((p) => {
                        const Icon = platformIcons[p];
                        return (
                          <div
                            key={p}
                            className="rounded-lg border p-3 text-sm"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={cn("h-4 w-4", platformColors[p])} />
                              <span className="font-medium capitalize">{p}</span>
                              {formContent.length > platformLimits[p] && (
                                <Badge variant="destructive" className="text-xs">
                                  Exceeds limit
                                </Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {formContent.slice(0, platformLimits[p])}
                              {formContent.length > platformLimits[p] && "..."}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={formPlatforms.length === 0 || !formContent}
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={handleSchedule}
                  disabled={
                    formPlatforms.length === 0 ||
                    !formContent ||
                    !formDate ||
                    !formTime
                  }
                >
                  Schedule
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
