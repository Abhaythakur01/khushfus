"use client";

import React from "react";

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-800 ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header skeleton */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <Pulse className="h-6 w-32" />
          <div className="flex items-center gap-3">
            <Pulse className="h-9 w-48" />
            <Pulse className="h-9 w-32" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {/* Row 1 - Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <Pulse className="mb-3 h-3 w-24" />
              <Pulse className="mb-2 h-8 w-28" />
              <Pulse className="h-3 w-36" />
            </div>
          ))}
        </div>

        {/* Row 2 - Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <Pulse className="mb-4 h-4 w-40" />
            <Pulse className="h-64 w-full" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <Pulse className="mb-4 h-4 w-36" />
            <Pulse className="mx-auto h-48 w-48 rounded-full" />
            <div className="mt-4 flex justify-center gap-4">
              <Pulse className="h-3 w-16" />
              <Pulse className="h-3 w-16" />
              <Pulse className="h-3 w-16" />
            </div>
          </div>
        </div>

        {/* Row 3 - Three columns */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <Pulse className="mb-4 h-4 w-32" />
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Pulse key={j} className="h-6 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Row 4 - Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <Pulse className="mb-4 h-4 w-32" />
          <div className="space-y-3">
            <Pulse className="h-4 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Pulse key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
