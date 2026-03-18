"use client";

import React from "react";

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className ?? ""}`} />;
}

export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-200">
      {/* Header skeleton */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0f1a]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <Pulse className="h-6 w-32" />
          <div className="flex items-center gap-3">
            <Pulse className="h-9 w-36" />
            <Pulse className="h-9 w-24" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {/* Tab bar skeleton */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Pulse key={i} className="h-9 w-28 rounded-md" />
          ))}
        </div>

        {/* Two chart cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5"
            >
              <Pulse className="mb-4 h-4 w-40" />
              <Pulse className="h-64 w-full" />
            </div>
          ))}
        </div>

        {/* Heatmap / large chart placeholder */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <Pulse className="mb-4 h-4 w-36" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 * 12 }).map((_, i) => (
              <Pulse key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>

        {/* Two side-by-side lists */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5"
            >
              <Pulse className="mb-4 h-4 w-32" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Pulse key={j} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
