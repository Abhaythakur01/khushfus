"use client";

import React, { useMemo } from "react";
import { cn, formatNumber } from "@/lib/utils";
import { Globe } from "lucide-react";

interface GeoDataPoint {
  region: string;
  country?: string;
  mentions: number;
  sentiment?: number;
}

interface GeoMapProps {
  data: GeoDataPoint[];
  className?: string;
}

const REGION_META: Record<string, { label: string; color: string }> = {
  "United States": { label: "US", color: "bg-blue-500/15 border-blue-500/30" },
  "United Kingdom": { label: "UK", color: "bg-indigo-500/15 border-indigo-500/30" },
  "India": { label: "IN", color: "bg-orange-500/15 border-orange-500/30" },
  "Germany": { label: "DE", color: "bg-yellow-500/15 border-yellow-500/30" },
  "France": { label: "FR", color: "bg-blue-500/15 border-blue-500/30" },
  "Canada": { label: "CA", color: "bg-red-500/15 border-red-500/30" },
  "Australia": { label: "AU", color: "bg-green-500/15 border-green-500/30" },
  "Japan": { label: "JP", color: "bg-pink-500/15 border-pink-500/30" },
  "Brazil": { label: "BR", color: "bg-emerald-500/15 border-emerald-500/30" },
  "Global": { label: "GL", color: "bg-purple-500/15 border-purple-500/30" },
};

function getRegionMeta(region: string) {
  return REGION_META[region] || { label: region.slice(0, 2).toUpperCase(), color: "bg-slate-500/15 border-slate-500/30" };
}

export function GeoMap({ data, className }: GeoMapProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.mentions - a.mentions);
  }, [data]);

  const maxMentions = sortedData[0]?.mentions || 1;

  if (sortedData.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-64 text-slate-500", className)}>
        <Globe className="h-10 w-10 mb-2 text-slate-600" />
        <p className="text-sm">No geographic data available</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {sortedData.map((item) => {
        const meta = getRegionMeta(item.region);
        const percentage = (item.mentions / maxMentions) * 100;

        return (
          <div
            key={item.region}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-slate-800/30",
              meta.color
            )}
          >
            <span className="text-xs font-bold shrink-0 w-8 h-8 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-300">
              {meta.label}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-200 truncate">
                  {item.region}
                  {item.country && item.country !== item.region && (
                    <span className="text-slate-500 ml-1">({item.country})</span>
                  )}
                </span>
                <span className="text-sm font-semibold text-slate-300 tabular-nums ml-2">
                  {formatNumber(item.mentions)}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            {item.sentiment !== undefined && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded",
                item.sentiment > 0.3 ? "text-emerald-400" : item.sentiment < -0.3 ? "text-red-400" : "text-slate-400"
              )}>
                {item.sentiment > 0 ? "+" : ""}{(item.sentiment * 100).toFixed(0)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
