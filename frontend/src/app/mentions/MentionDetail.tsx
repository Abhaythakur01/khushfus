"use client";

import React from "react";
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
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { PLATFORM_COLORS, PLATFORM_LABELS, SENTIMENT_BADGE } from "@/lib/constants";
import type { Mention } from "@/hooks/useMentions";

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

export default function MentionDetail({ mention, onClose, onFlag, onSentimentOverride }: {
  mention: Mention;
  onClose: () => void;
  onFlag: () => void;
  onSentimentOverride?: (sentiment: string) => void;
}) {
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
        <button onClick={onClose} aria-label="Close detail panel" className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Full text -- rendered as text node, auto-escaped by React (6.4) */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-6 border border-slate-700/50">
        <p className="text-sm text-slate-200 leading-relaxed">{mention.text}</p>
      </div>

      {/* Author stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="text-center p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
          <p className="text-lg font-bold text-slate-100">{formatNumber(mention.author.followers)}</p>
          <p className="text-xs text-slate-500">Followers</p>
        </div>
        <div className="text-center p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
          <p className="text-lg font-bold text-slate-100">{mention.author.influence_score}</p>
          <p className="text-xs text-slate-500">Influence</p>
        </div>
        <div className="text-center p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
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
        <div className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
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
                  : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

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
              <span key={t} className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded-md border border-slate-700">{t}</span>
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
      <div className="flex gap-2 border-t border-slate-800 pt-4">
        <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          <MessageCircle className="h-4 w-4" /> Reply
        </button>
        <button
          onClick={onFlag}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors",
            mention.is_flagged
              ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          )}
        >
          <Flag className="h-4 w-4" fill={mention.is_flagged ? "currentColor" : "none"} />
          {mention.is_flagged ? "Flagged" : "Flag"}
        </button>
        <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Download className="h-4 w-4" /> Export
        </button>
      </div>
    </div>
  );
}
