// Platform colors used across dashboard, mentions, and analytics pages
export const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1DA1F2",
  facebook: "#1877F2",
  instagram: "#E4405F",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  reddit: "#FF4500",
  news: "#6366f1",
  blogs: "#8b5cf6",
  tiktok: "#010101",
  telegram: "#0088cc",
  mastodon: "#6364FF",
};

export const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  news: "News",
  blogs: "Blogs",
  tiktok: "TikTok",
  telegram: "Telegram",
  mastodon: "Mastodon",
};

export const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  negative: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  mixed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export const PLATFORMS = [
  "all", "twitter", "instagram", "facebook", "linkedin",
  "youtube", "reddit", "tiktok", "news", "mastodon",
] as const;

export const SENTIMENTS = ["all", "positive", "negative", "neutral", "mixed"] as const;
