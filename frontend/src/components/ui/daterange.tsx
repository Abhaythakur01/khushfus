"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

function today(): string {
  return toDateStr(new Date());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRange {
  startDate: string;
  endDate: string;
}

type Preset = "today" | "7d" | "30d" | "90d" | "custom";

const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "Custom", value: "custom" },
];

function resolvePreset(preset: Preset): DateRange {
  const end = today();
  switch (preset) {
    case "today":
      return { startDate: end, endDate: end };
    case "7d":
      return { startDate: daysAgo(7), endDate: end };
    case "30d":
      return { startDate: daysAgo(30), endDate: end };
    case "90d":
      return { startDate: daysAgo(90), endDate: end };
    default:
      return { startDate: daysAgo(30), endDate: end };
  }
}

// ---------------------------------------------------------------------------
// DateRangePicker
// ---------------------------------------------------------------------------

interface DateRangePickerProps {
  /** Called whenever the date range changes (preset click or manual input). */
  onChange: (range: DateRange) => void;
  /** Initial preset to show active. Defaults to "30d". */
  defaultPreset?: Preset;
  className?: string;
}

export function DateRangePicker({
  onChange,
  defaultPreset = "30d",
  className,
}: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<Preset>(defaultPreset);
  const initial = resolvePreset(defaultPreset);
  const [customStart, setCustomStart] = useState(initial.startDate);
  const [customEnd, setCustomEnd] = useState(initial.endDate);

  const handlePreset = useCallback(
    (preset: Preset) => {
      setActivePreset(preset);
      if (preset !== "custom") {
        const range = resolvePreset(preset);
        setCustomStart(range.startDate);
        setCustomEnd(range.endDate);
        onChange(range);
      }
    },
    [onChange]
  );

  const handleCustomStart = useCallback(
    (value: string) => {
      setCustomStart(value);
      setActivePreset("custom");
      onChange({ startDate: value, endDate: customEnd });
    },
    [customEnd, onChange]
  );

  const handleCustomEnd = useCallback(
    (value: string) => {
      setCustomEnd(value);
      setActivePreset("custom");
      onChange({ startDate: customStart, endDate: value });
    },
    [customStart, onChange]
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Preset buttons */}
      <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-all duration-200",
              activePreset === p.value
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date inputs — always visible for Custom, shown alongside preset label for context */}
      {activePreset === "custom" && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="date"
              value={customStart}
              max={customEnd || today()}
              onChange={(e) => handleCustomStart(e.target.value)}
              className={cn(
                "h-9 rounded-lg border border-white/[0.08] bg-white/[0.06]",
                "pl-8 pr-3 text-sm text-slate-200",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                // Style the native date picker to match dark theme
                "[color-scheme:dark]"
              )}
              aria-label="Start date"
            />
          </div>

          <span className="text-xs text-slate-600 select-none">to</span>

          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={today()}
              onChange={(e) => handleCustomEnd(e.target.value)}
              className={cn(
                "h-9 rounded-lg border border-white/[0.08] bg-white/[0.06]",
                "pl-8 pr-3 text-sm text-slate-200",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                "[color-scheme:dark]"
              )}
              aria-label="End date"
            />
          </div>
        </div>
      )}
    </div>
  );
}
