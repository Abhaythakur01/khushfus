"use client";

import { useState, useEffect, useMemo } from "react";
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
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { useAutoSave, loadDraft, clearDraft } from "@/hooks/useAutoSave";
import toast from "react-hot-toast";

const DRAFT_KEY = "new_project";

const PLATFORMS = [
  { id: "twitter", label: "Twitter", color: "bg-[#1DA1F2]" },
  { id: "reddit", label: "Reddit", color: "bg-[#FF4500]" },
  { id: "news", label: "News & Blogs", color: "bg-indigo-500" },
  { id: "youtube", label: "YouTube", color: "bg-[#FF0000]" },
  { id: "mastodon", label: "Mastodon", color: "bg-[#6364FF]" },
  { id: "instagram", label: "Instagram", color: "bg-[#E4405F]" },
  { id: "facebook", label: "Facebook", color: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", color: "bg-[#0A66C2]" },
  { id: "tiktok", label: "TikTok", color: "bg-slate-300 text-slate-900" },
  { id: "telegram", label: "Telegram", color: "bg-[#26A5E4]" },
];

const KEYWORD_TYPES = ["brand", "competitor", "product", "campaign", "topic"] as const;
type KeywordType = (typeof KEYWORD_TYPES)[number];

interface KeywordEntry {
  id: number;
  term: string;
  type: KeywordType;
}

const KEYWORD_TYPE_COLORS: Record<KeywordType, string> = {
  brand: "bg-indigo-500/20 text-indigo-300",
  competitor: "bg-red-500/20 text-red-300",
  product: "bg-emerald-500/20 text-emerald-300",
  campaign: "bg-amber-500/20 text-amber-300",
  topic: "bg-violet-500/20 text-violet-300",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<KeywordEntry[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordType, setKeywordType] = useState<KeywordType>("brand");

  // Draft restoration banner
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // ---------- 6.34 Draft auto-save ----------
  const formState = useMemo(
    () => ({ name, clientName, description, selectedPlatforms, keywords }),
    [name, clientName, description, selectedPlatforms, keywords]
  );
  useAutoSave(DRAFT_KEY, formState, 5000);

  // On mount, check for a saved draft and offer to restore
  useEffect(() => {
    const draft = loadDraft<typeof formState>(DRAFT_KEY);
    if (draft && (draft.name || draft.clientName || draft.keywords?.length)) {
      setShowDraftBanner(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restoreDraft() {
    const draft = loadDraft<typeof formState>(DRAFT_KEY);
    if (draft) {
      setName(draft.name || "");
      setClientName(draft.clientName || "");
      setDescription(draft.description || "");
      setSelectedPlatforms(draft.selectedPlatforms || []);
      setKeywords(draft.keywords || []);
    }
    setShowDraftBanner(false);
  }

  function discardDraft() {
    clearDraft(DRAFT_KEY);
    setShowDraftBanner(false);
  }

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
    setSubmitError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        client_name: clientName.trim(),
        platforms: selectedPlatforms.join(","),
        organization_id: 0,
        keywords: keywords.map((k) => ({
          term: k.term,
          keyword_type: k.type,
        })),
      };
      const created = await api.createProject(payload);
      clearDraft(DRAFT_KEY);
      toast.success("Project created successfully");
      router.push(`/projects/${created.id}`);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      const msg = err?.body ? String(err.body) : "Failed to create project. Please try again.";
      setSubmitError(msg);
      toast.error("Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title="New Project">
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <p className="text-sm text-slate-500 mt-3">
            Set up a new social listening project to monitor your brand
          </p>
        </div>

        {/* Draft restore banner */}
        {showDraftBanner && (
          <div className="mb-6 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between">
            <p className="text-sm text-indigo-300">You have an unsaved draft. Would you like to restore it?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={restoreDraft}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Details */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Project Details</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Brand Monitoring Q1 2026"
                  className={cn(
                    "w-full h-10 rounded-lg border px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-800/60",
                    errors.name ? "border-red-500/50" : "border-slate-700"
                  )}
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="client" className="block text-sm font-medium text-slate-300 mb-1">
                  Client Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="client"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className={cn(
                    "w-full h-10 rounded-lg border px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-800/60",
                    errors.clientName ? "border-red-500/50" : "border-slate-700"
                  )}
                />
                {errors.clientName && (
                  <p className="text-xs text-red-400 mt-1">{errors.clientName}</p>
                )}
              </div>

              <div>
                <label htmlFor="desc" className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the purpose and scope of this project..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Platforms */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Platforms</h2>
            <p className="text-sm text-slate-500 mb-4">
              Select the platforms you want to monitor
            </p>
            {errors.platforms && (
              <p className="text-xs text-red-400 mb-3">{errors.platforms}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-700 bg-slate-800/40 hover:border-slate-600"
                    )}
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0",
                        p.color
                      )}
                    >
                      {p.label.substring(0, 2)}
                    </span>
                    <span className="text-sm font-medium text-slate-300 truncate">{p.label}</span>
                    {selected && (
                      <Check className="h-4 w-4 text-indigo-400 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keywords */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Keywords</h2>
            <p className="text-sm text-slate-500 mb-4">
              Add keywords to track across selected platforms
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder="Enter keyword or phrase..."
                className="flex-1 h-10 rounded-lg border border-slate-700 bg-slate-800/60 px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={keywordType}
                onChange={(e) => setKeywordType(e.target.value as KeywordType)}
                className="h-10 rounded-lg border border-slate-700 bg-slate-800/60 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="flex items-center gap-3 p-2.5 bg-slate-800/60 rounded-lg border border-slate-700"
                  >
                    <span className="text-sm font-medium text-slate-200 flex-1">{kw.term}</span>
                    <select
                      value={kw.type}
                      onChange={(e) => updateKeywordType(kw.id, e.target.value as KeywordType)}
                      className="h-8 rounded border border-slate-600 bg-slate-700 px-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      className="p-1 rounded hover:bg-slate-600 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6">
                No keywords added yet. Add keywords above to start tracking.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pb-8">
            <Link
              href="/projects"
              className="px-5 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
    </AppShell>
  );
}
