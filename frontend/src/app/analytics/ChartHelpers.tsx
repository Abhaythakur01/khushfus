"use client";

import React from "react";
import { formatNumber } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-medium" style={{ color: p.color }}>
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Inbox className="h-12 w-12 text-slate-700 mb-3" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}
