import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Animated skeleton placeholder for loading states.
 * Uses Tailwind's animate-pulse for shimmer effect.
 *
 * @example
 * <Skeleton className="h-4 w-48" />           // text line
 * <Skeleton className="h-10 w-full" />         // input field
 * <Skeleton className="h-32 w-full rounded-xl" /> // card
 * <SkeletonCard />                             // pre-built card skeleton
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-800/60",
        className,
      )}
    />
  );
}

/** A pre-built card skeleton with title, subtitle and content lines. */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

/** Skeleton for a table row. */
export function SkeletonRow({ columns = 4, className }: SkeletonProps & { columns?: number }) {
  return (
    <div className={cn("flex items-center gap-4 py-3", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}

/** Skeleton for a list of items. */
export function SkeletonList({ count = 5, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
