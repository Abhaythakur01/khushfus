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
  positive: "bg-success-50 text-success-700 ring-success-600/20",
  negative: "bg-danger-50 text-danger-700 ring-danger-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
  twitter: "bg-sky-50 text-sky-700 ring-sky-600/20",
  facebook: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  instagram: "bg-pink-50 text-pink-700 ring-pink-600/20",
  reddit: "bg-orange-50 text-orange-700 ring-orange-600/20",
  news: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blog: "bg-violet-50 text-violet-700 ring-violet-600/20",
  youtube: "bg-red-50 text-red-700 ring-red-600/20",
  default: "bg-slate-100 text-slate-600 ring-slate-500/10",
  destructive: "bg-danger-50 text-danger-700 ring-danger-600/20",
  outline: "bg-transparent text-slate-700 ring-slate-300",
};

const sizeStyles = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

function Badge({ variant = "default", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full ring-1 ring-inset capitalize",
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
