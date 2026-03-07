"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { id: "twitter", label: "Twitter", color: "bg-sky-500" },
  { id: "instagram", label: "Instagram", color: "bg-gradient-to-br from-purple-500 to-pink-500" },
  { id: "facebook", label: "Facebook", color: "bg-blue-600" },
  { id: "linkedin", label: "LinkedIn", color: "bg-blue-700" },
  { id: "youtube", label: "YouTube", color: "bg-red-600" },
  { id: "reddit", label: "Reddit", color: "bg-orange-500" },
  { id: "tiktok", label: "TikTok", color: "bg-gray-900" },
  { id: "news", label: "News & Blogs", color: "bg-emerald-600" },
];

const KEYWORD_TYPES = ["brand", "competitor", "product", "campaign", "topic"] as const;
type KeywordType = (typeof KEYWORD_TYPES)[number];

interface KeywordEntry {
  id: number;
  term: string;
  type: KeywordType;
}

const KEYWORD_TYPE_COLORS: Record<KeywordType, string> = {
  brand: "bg-indigo-100 text-indigo-700",
  competitor: "bg-red-100 text-red-700",
  product: "bg-emerald-100 text-emerald-700",
  campaign: "bg-amber-100 text-amber-700",
  topic: "bg-violet-100 text-violet-700",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<KeywordEntry[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordType, setKeywordType] = useState<KeywordType>("brand");
  const [competitorIds, setCompetitorIds] = useState("");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function addKeyword() {
    const term = keywordInput.trim();
    if (!term) return;
    if (keywords.some((k) => k.term.toLowerCase() === term.toLowerCase())) return;
    setKeywords((prev) => [...prev, { id: Date.now(), term, type: keywordType }]);
    setKeywordInput("");
  }

  function removeKeyword(id: number) {
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  function updateKeywordType(id: number, type: KeywordType) {
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, type } : k)));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Project name is required";
    if (!clientName.trim()) errs.clientName = "Client name is required";
    if (selectedPlatforms.length === 0) errs.platforms = "Select at least one platform";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1000));
    setIsSubmitting(false);
    router.push("/projects");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up a new social listening project to monitor your brand
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Project Details</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Brand Monitoring Q1 2026"
                  className={cn(
                    "w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
                    errors.name ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
                  )}
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="client"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className={cn(
                    "w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
                    errors.clientName ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
                  )}
                />
                {errors.clientName && (
                  <p className="text-xs text-red-600 mt-1">{errors.clientName}</p>
                )}
              </div>

              <div>
                <label htmlFor="desc" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the purpose and scope of this project..."
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Platforms */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Platforms</h2>
            <p className="text-sm text-gray-500 mb-4">
              Select the platforms you want to monitor
            </p>
            {errors.platforms && (
              <p className="text-xs text-red-600 mb-3">{errors.platforms}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PLATFORMS.map((p) => {
                const selected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all text-left",
                      selected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "h-7 w-7 rounded-md text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0",
                        p.color
                      )}
                    >
                      {p.label.substring(0, 2)}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{p.label}</span>
                    {selected && (
                      <Check className="h-4 w-4 text-indigo-600 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keywords */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Keywords</h2>
            <p className="text-sm text-gray-500 mb-4">
              Add keywords to track across selected platforms
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder="Enter keyword or phrase..."
                className="flex-1 h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={keywordType}
                onChange={(e) => setKeywordType(e.target.value as KeywordType)}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {KEYWORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addKeyword}
                className="inline-flex items-center gap-1.5 px-4 h-10 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>

            {keywords.length > 0 ? (
              <div className="space-y-2">
                {keywords.map((kw) => (
                  <div
                    key={kw.id}
                    className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <span className="text-sm font-medium text-gray-800 flex-1">{kw.term}</span>
                    <select
                      value={kw.type}
                      onChange={(e) => updateKeywordType(kw.id, e.target.value as KeywordType)}
                      className="h-8 rounded border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {KEYWORD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-semibold rounded-full",
                        KEYWORD_TYPE_COLORS[kw.type]
                      )}
                    >
                      {kw.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw.id)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                No keywords added yet. Add keywords above to start tracking.
              </p>
            )}
          </div>

          {/* Competitor IDs */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Advanced</h2>
            <p className="text-sm text-gray-500 mb-4">Optional configuration</p>

            <div>
              <label
                htmlFor="competitors"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Competitor IDs
              </label>
              <input
                id="competitors"
                type="text"
                value={competitorIds}
                onChange={(e) => setCompetitorIds(e.target.value)}
                placeholder="Comma-separated competitor account IDs (optional)"
                className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter competitor social account IDs for competitive analysis
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pb-8">
            <Link
              href="/projects"
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
