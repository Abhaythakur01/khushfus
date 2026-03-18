import React from "react";
import { cn } from "@/lib/utils";

type SentimentVariant = "positive" | "negative" | "neutral";
type PlatformVariant =
  | "twitter"
  | "facebook"
  | "instagram"
  | "reddit"
  | "news"
  | "blog"
  | "youtube";
type BadgeVariant = SentimentVariant | PlatformVariant | "default" | "destructive" | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<BadgeVariant, string> = {
  positive: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  negative: "bg-red-500/10 text-red-400 ring-red-500/20",
  neutral: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  twitter: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
  facebook: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
  instagram: "bg-pink-500/10 text-pink-400 ring-pink-500/20",
  reddit: "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  news: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  blog: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  youtube: "bg-red-500/10 text-red-400 ring-red-500/20",
  default: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  destructive: "bg-red-500/10 text-red-400 ring-red-500/20",
  outline: "bg-transparent text-slate-400 ring-white/[0.1]",
};

const sizeStyles = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
};

function Badge({ variant = "default", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full ring-1 ring-inset capitalize tracking-wide",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };
