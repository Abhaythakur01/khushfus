"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Flag,
  Heart,
  Share2,
  MessageCircle,
  ExternalLink,
  X,
  Download,
  Bot,
  Globe,
  Clock,
  Loader2,
  Tag,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatNumber } from "@/lib/utils";
import { PLATFORM_COLORS, PLATFORM_LABELS, SENTIMENT_BADGE } from "@/lib/constants";
import { api } from "@/lib/api";
import type { Mention } from "@/hooks/useMentions";

// ---------------------------------------------------------------------------
// Tag system — localStorage-backed
// ---------------------------------------------------------------------------

const LS_KEY = "khushfus_mention_tags";

// Predefined tag categories and their colours
export const TAG_CATEGORIES: Record<string, { bg: string; text: string; border: string }> = {
  product:    { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30"  },
  support:    { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30"   },
  feedback:   { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30"    },
  complaint:  { bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/30"     },
  praise:     { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  question:   { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30"  },
  bug:        { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/30"    },
  feature:    { bg: "bg-teal-500/15",    text: "text-teal-300",    border: "border-teal-500/30"    },
  urgent:     { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30"  },
  review:     { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/30"    },
};

const PREDEFINED_TAGS = Object.keys(TAG_CATEGORIES);

function getTagStyle(tag: string) {
  const lower = tag.toLowerCase();
  // Direct match
  if (TAG_CATEGORIES[lower]) return TAG_CATEGORIES[lower];
  // Partial match
  const match = PREDEFINED_TAGS.find((k) => lower.includes(k) || k.includes(lower));
  if (match) return TAG_CATEGORIES[match];
  // Default
  return { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/30" };
}

export function loadAllTags(): Record<number, string[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllTags(all: Record<number, string[]>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // storage full — silently ignore
  }
}

function loadMentionTags(mentionId: number): string[] {
  return loadAllTags()[mentionId] ?? [];
}

function saveMentionTags(mentionId: number, tags: string[]) {
  const all = loadAllTags();
  if (tags.length === 0) {
    delete all[mentionId];
  } else {
    all[mentionId] = tags;
  }
  saveAllTags(all);
}

/** Collect all tags currently used across all mentions */
export function collectAllUsedTags(): string[] {
  const all = loadAllTags();
  const set = new Set<string>();
  Object.values(all).forEach((tags) => tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// TagBadge
// ---------------------------------------------------------------------------

function TagBadge({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const style = getTagStyle(tag);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border",
        style.bg, style.text, style.border,
      )}
    >
      {tag}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove tag ${tag}`}
          className="ml-0.5 rounded-full hover:opacity-70 transition-opacity leading-none"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TagsSection — inline tag management within the detail panel
// ---------------------------------------------------------------------------

function TagsSection({ mentionId }: { mentionId: number }) {
  const [tags, setTags] = useState<string[]>(() => loadMentionTags(mentionId));
  const [addOpen, setAddOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync when mentionId changes
  useEffect(() => {
    setTags(loadMentionTags(mentionId));
    setAddOpen(false);
    setInputValue("");
  }, [mentionId]);

  // Build autocomplete list from predefined + already used, minus already applied
  useEffect(() => {
    if (!addOpen) return;
    const query = inputValue.trim().toLowerCase();
    const pool = Array.from(new Set([...PREDEFINED_TAGS, ...collectAllUsedTags()])).filter(
      (t) => !tags.includes(t),
    );
    if (!query) {
      setSuggestions(pool.slice(0, 8));
    } else {
      setSuggestions(pool.filter((t) => t.toLowerCase().includes(query)).slice(0, 8));
    }
  }, [inputValue, addOpen, tags]);

  useEffect(() => {
    if (addOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [addOpen]);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed || tags.includes(trimmed)) return;
    const next = [...tags, trimmed];
    setTags(next);
    saveMentionTags(mentionId, next);
    setInputValue("");
    setAddOpen(false);
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    saveMentionTags(mentionId, next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) addTag(inputValue);
    } else if (e.key === "Escape") {
      setAddOpen(false);
      setInputValue("");
    }
  }

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5" /> Tags
      </h3>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <TagBadge key={tag} tag={tag} onRemove={() => removeTag(tag)} />
        ))}

        {!addOpen && (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border border-dashed border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add Tag
          </button>
        )}
      </div>

      {addOpen && (
        <div className="relative">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a tag and press Enter…"
            className="w-full h-8 rounded-lg border border-indigo-500/40 bg-white/[0.06] px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
          <button
            onClick={() => { setAddOpen(false); setInputValue(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {suggestions.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-[#141925] border border-white/[0.08] rounded-lg shadow-xl overflow-hidden">
              {suggestions.map((s) => {
                const style = getTagStyle(s);
                return (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <span
                      className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        style.bg.replace("/15", "/60"),
                      )}
                    />
                    <span className={style.text}>{s}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function AuthorAvatar({ name }: { name: string }) {
  const colors = [
    "bg-indigo-600", "bg-pink-600", "bg-teal-600", "bg-amber-600",
    "bg-violet-600", "bg-cyan-600", "bg-rose-600", "bg-lime-600",
  ];
  const idx = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <span className={cn("h-9 w-9 rounded-full inline-flex items-center justify-center text-white text-sm font-semibold shrink-0", colors[idx])}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

function PlatformIcon({ platform, size = "sm" }: { platform: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  const color = PLATFORM_COLORS[platform] || "#64748b";
  return (
    <span
      className={cn(s, "inline-flex items-center justify-center rounded-md text-white font-bold shrink-0")}
      style={{ backgroundColor: color }}
    >
      {(PLATFORM_LABELS[platform] || platform || "?")[0].toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MentionDetail — main export
// ---------------------------------------------------------------------------

export default function MentionDetail({ mention, onClose, onFlag, onSentimentOverride }: {
  mention: Mention;
  onClose: () => void;
  onFlag: () => void;
  onSentimentOverride?: (sentiment: string) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      await api.createPost({
        platform: mention.platform,
        content: replyText.trim(),
        reply_to_mention_id: mention.id,
        status: "published",
      });
      toast.success("Reply sent");
      setReplyText("");
      setReplyOpen(false);
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <AuthorAvatar name={mention.author.name} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">{mention.author.name}</span>
              {mention.author.is_bot && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 rounded-full border border-red-500/30">
                  <Bot className="h-2.5 w-2.5" /> Bot
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{mention.author.handle}</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close detail panel" className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Full text -- rendered as text node, auto-escaped by React (6.4) */}
      <div className="bg-white/[0.04] rounded-xl p-4 mb-6 border border-white/[0.06]">
        <p className="text-sm text-slate-200 leading-relaxed">{mention.text}</p>
      </div>

      {/* Author stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="text-center p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
          <p className="text-lg font-bold text-slate-100">{formatNumber(mention.author.followers)}</p>
          <p className="text-xs text-slate-500">Followers</p>
        </div>
        <div className="text-center p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
          <p className="text-lg font-bold text-slate-100">{mention.author.influence_score}</p>
          <p className="text-xs text-slate-500">Influence</p>
        </div>
        <div className="text-center p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
          <p className="text-lg font-bold text-slate-100">{formatNumber(mention.reach)}</p>
          <p className="text-xs text-slate-500">Reach</p>
        </div>
      </div>

      {/* Platform + source */}
      <div className="flex items-center gap-2 mb-5">
        <PlatformIcon platform={mention.platform} size="md" />
        <span className="text-sm font-medium text-slate-300">{PLATFORM_LABELS[mention.platform] || mention.platform}</span>
        {mention.source_url && (
          <a href={mention.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 ml-auto">
            View original <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Engagement */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Engagement</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 p-2.5 bg-pink-500/10 rounded-lg border border-pink-500/20">
            <Heart className="h-4 w-4 text-pink-400" />
            <div>
              <p className="text-sm font-semibold text-slate-100">{formatNumber(mention.likes)}</p>
              <p className="text-[10px] text-slate-500">Likes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Share2 className="h-4 w-4 text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-slate-100">{formatNumber(mention.shares)}</p>
              <p className="text-[10px] text-slate-500">Shares</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-violet-500/10 rounded-lg border border-violet-500/20">
            <MessageCircle className="h-4 w-4 text-violet-400" />
            <div>
              <p className="text-sm font-semibold text-slate-100">{formatNumber(mention.comments)}</p>
              <p className="text-[10px] text-slate-500">Comments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sentiment */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sentiment Analysis</h3>
        <div className="flex items-center gap-3 p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
          <span className={cn("px-2.5 py-1 text-xs font-semibold rounded-full border", SENTIMENT_BADGE[mention.sentiment] || SENTIMENT_BADGE.neutral)}>
            {mention.sentiment.charAt(0).toUpperCase() + mention.sentiment.slice(1)}
          </span>
          <div className="text-sm text-slate-400">
            Score: <span className="font-medium text-slate-300">{mention.sentiment_score.toFixed(2)}</span>
          </div>
          <div className="text-sm text-slate-400">
            Confidence: <span className="font-medium text-slate-300">{(mention.sentiment_confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        {/* Sentiment override */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Override:</span>
          {["positive", "neutral", "negative"].map((s) => (
            <button
              key={s}
              onClick={() => onSentimentOverride?.(s)}
              className={cn(
                "px-2 py-1 text-[11px] font-medium rounded-md border transition-colors",
                mention.sentiment === s
                  ? s === "positive" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : s === "negative" ? "bg-red-500/20 border-red-500/40 text-red-400"
                    : "bg-slate-500/20 border-slate-500/40 text-slate-400"
                  : "bg-white/[0.06] border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-slate-600"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <TagsSection mentionId={mention.id} />

      {/* Keywords */}
      {mention.keywords.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Matched Keywords</h3>
          <div className="flex flex-wrap gap-1.5">
            {mention.keywords.map((kw) => (
              <span key={kw} className="px-2 py-1 text-xs bg-indigo-500/15 text-indigo-300 rounded-md border border-indigo-500/20">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {mention.topics.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Topics</h3>
          <div className="flex flex-wrap gap-1.5">
            {mention.topics.map((t) => (
              <span key={t} className="px-2 py-1 text-xs bg-white/[0.06] text-slate-400 rounded-md border border-white/[0.08]">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Language + time */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
        <span className="inline-flex items-center gap-1">
          <Globe className="h-3.5 w-3.5" /> {mention.language.toUpperCase()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {mention.created_at ? new Date(mention.created_at).toLocaleString() : "Unknown"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/[0.06] pt-4">
        <button
          onClick={() => setReplyOpen((o) => !o)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <MessageCircle className="h-4 w-4" /> Reply
        </button>
        <button
          onClick={onFlag}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors",
            mention.is_flagged
              ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
              : "bg-white/[0.06] border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"
          )}
        >
          <Flag className="h-4 w-4" fill={mention.is_flagged ? "currentColor" : "none"} />
          {mention.is_flagged ? "Flagged" : "Flag"}
        </button>
        <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] text-slate-300 text-sm font-medium rounded-lg hover:bg-white/[0.04] transition-colors">
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* Inline reply area */}
      {replyOpen && (
        <div className="mt-4 space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            className="w-full rounded-lg bg-white/[0.06] border border-white/[0.08] text-slate-100 placeholder:text-slate-500 text-sm px-3 py-2 resize-none focus:outline-none focus:border-indigo-500"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setReplyOpen(false); setReplyText(""); }}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReply}
              disabled={replySending || !replyText.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {replySending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
