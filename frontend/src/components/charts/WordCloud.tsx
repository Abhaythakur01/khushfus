"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface WordCloudWord {
  text: string;
  value: number;
  sentiment?: "positive" | "negative" | "neutral";
}

interface WordCloudProps {
  words: WordCloudWord[];
  maxWords?: number;
  className?: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

export function WordCloud({ words, maxWords = 50, className }: WordCloudProps) {
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);

  const processedWords = useMemo(() => {
    const sorted = [...words].sort((a, b) => b.value - a.value).slice(0, maxWords);
    if (sorted.length === 0) return [];

    const maxVal = sorted[0].value;
    const minVal = sorted[sorted.length - 1].value;
    const range = maxVal - minVal || 1;

    return sorted.map((word) => {
      const normalized = (word.value - minVal) / range;
      const fontSize = 14 + normalized * 34; // 14px to 48px
      const opacity = 0.5 + normalized * 0.5; // 0.5 to 1.0
      const color = word.sentiment ? SENTIMENT_COLORS[word.sentiment] || "#818cf8" : "#818cf8";

      return { ...word, fontSize, opacity, color };
    });
  }, [words, maxWords]);

  // Shuffle for visual variety (deterministic based on content)
  const shuffled = useMemo(() => {
    const arr = [...processedWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.abs((arr[i].text.charCodeAt(0) * 31 + i) % (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [processedWords]);

  if (shuffled.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-slate-500 text-sm", className)}>
        No keyword data available
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 p-4", className)}>
      {shuffled.map((word) => (
        <span
          key={word.text}
          className="cursor-default transition-all duration-200 hover:scale-110 relative inline-block"
          style={{
            fontSize: `${word.fontSize}px`,
            color: word.color,
            opacity: hoveredWord && hoveredWord !== word.text ? 0.3 : word.opacity,
            lineHeight: 1.2,
            fontWeight: word.fontSize > 30 ? 700 : word.fontSize > 20 ? 600 : 400,
          }}
          onMouseEnter={() => setHoveredWord(word.text)}
          onMouseLeave={() => setHoveredWord(null)}
          title={`${word.text}: ${word.value} mentions`}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}
