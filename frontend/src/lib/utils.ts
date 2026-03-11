import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return n.toString();
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "MMM d, yyyy");
}

export function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len).trimEnd() + "...";
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Extract a user-friendly message from any thrown error. */
export function getErrorMessage(err: unknown, fallback = "An unexpected error occurred"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as any).message);
  return fallback;
}
