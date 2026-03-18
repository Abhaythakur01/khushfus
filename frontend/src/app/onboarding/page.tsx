"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Check, ChevronRight, ChevronLeft, Rocket, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const PLATFORMS = [
  { id: "twitter", label: "Twitter / X", icon: "𝕏" },
  { id: "facebook", label: "Facebook", icon: "f" },
  { id: "instagram", label: "Instagram", icon: "📷" },
  { id: "linkedin", label: "LinkedIn", icon: "in" },
  { id: "youtube", label: "YouTube", icon: "▶" },
  { id: "reddit", label: "Reddit", icon: "r/" },
  { id: "mastodon", label: "Mastodon", icon: "🐘" },
  { id: "tiktok", label: "TikTok", icon: "♪" },
  { id: "news", label: "News / RSS", icon: "📰" },
  { id: "discord", label: "Discord", icon: "💬" },
];

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Project" },
    { num: 2, label: "Configure" },
    { num: 3, label: "Ready" },
  ];

  return (
    <div className="flex items-center justify-center gap-3 mb-10">
      {steps.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                currentStep > step.num
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : currentStep === step.num
                  ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                  : "border-white/[0.08] bg-white/[0.06]/60 text-slate-500"
              }`}
            >
              {currentStep > step.num ? (
                <Check className="h-5 w-5" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={`text-xs font-medium ${
                currentStep >= step.num ? "text-slate-300" : "text-slate-600"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 w-16 rounded-full mt-[-18px] ${
                currentStep > step.num ? "bg-indigo-500" : "bg-slate-700"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);

  // Step 1 fields
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 fields
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  // Step 3 state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0f1a]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function togglePlatform(platformId: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  }

  function addKeyword() {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
      setKeywordInput("");
    }
  }

  function removeKeyword(keyword: string) {
    setKeywords((prev) => prev.filter((k) => k !== keyword));
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await api.createProject({
        name: projectName,
        client_name: clientName,
        description: description || undefined,
        platforms: selectedPlatforms,
        keywords: keywords.map((k) => ({ term: k, keyword_type: "brand" })),
      });
      setIsSuccess(true);
    } catch (err: any) {
      setSubmitError(
        err?.safeMessage || err?.message || "Failed to create project. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToNext() {
    if (step === 2) {
      handleSubmit();
      setStep(3);
    } else {
      setStep((s) => Math.min(s + 1, 3));
    }
  }

  function goToBack() {
    if (step === 3 && !isSuccess) {
      setStep(2);
    } else {
      setStep((s) => Math.max(s - 1, 1));
    }
  }

  // Validation
  const step1Valid = projectName.trim().length > 0 && clientName.trim().length > 0;
  const step2Valid = selectedPlatforms.length > 0 && keywords.length > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.04]">
        <div className="text-lg font-bold tracking-tight">
          <span className="text-indigo-400">Khush</span>Fus
        </div>
        {user && (
          <div className="text-sm text-slate-400">
            Welcome, <span className="text-slate-200">{user.full_name}</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <StepIndicator currentStep={step} />

          {/* ---- Step 1: Create Project ---- */}
          {step === 1 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">
                  Welcome to KhushFus
                </h1>
                <p className="text-slate-400 text-sm">
                  Let&apos;s set up your first social listening project. It only takes a minute.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Project Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., Brand Monitoring Q1"
                    className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.06] px-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Client / Brand Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g., Acme Corp"
                    className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.06] px-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Description <span className="text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What are you tracking? e.g., Brand sentiment across social media"
                    rows={3}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-end mt-8">
                <button
                  onClick={goToNext}
                  disabled={!step1Valid}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
                    step1Valid
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "bg-slate-700 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 2: Platforms & Keywords ---- */}
          {step === 2 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Configure Your Project</h1>
                <p className="text-slate-400 text-sm">
                  Choose which platforms to monitor and add keywords to track.
                </p>
              </div>

              {/* Platforms */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Platforms <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {PLATFORMS.map((platform) => {
                    const isActive = selectedPlatforms.includes(platform.id);
                    return (
                      <button
                        key={platform.id}
                        onClick={() => togglePlatform(platform.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-all ${
                          isActive
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                            : "bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        <span className="text-lg">{platform.icon}</span>
                        <span>{platform.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Keywords <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Add brand names, product names, hashtags, or any terms you want to track.
                </p>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    placeholder="Type a keyword and press Enter"
                    className="flex-1 h-10 rounded-lg border border-white/[0.08] bg-white/[0.06] px-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={addKeyword}
                    disabled={!keywordInput.trim()}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      keywordInput.trim()
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : "bg-slate-700 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    Add
                  </button>
                </div>

                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/15 border border-indigo-500/30 px-3 py-1 text-xs text-indigo-300"
                      >
                        {kw}
                        <button
                          onClick={() => removeKeyword(kw)}
                          className="hover:text-red-400 transition-colors ml-0.5"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between mt-8">
                <button
                  onClick={goToBack}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={goToNext}
                  disabled={!step2Valid}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
                    step2Valid
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "bg-slate-700 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Create Project
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 3: Success ---- */}
          {step === 3 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
              {isSubmitting ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mb-4" />
                  <p className="text-slate-300 text-sm">Creating your project...</p>
                </div>
              ) : submitError ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 mb-4">
                    <span className="text-2xl text-red-400">&times;</span>
                  </div>
                  <h2 className="text-xl font-bold mb-2 text-red-400">
                    Something went wrong
                  </h2>
                  <p className="text-slate-400 text-sm text-center max-w-md mb-6">
                    {submitError}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={goToBack}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Go Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : isSuccess ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                    <Rocket className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Your project is ready!</h2>
                  <p className="text-slate-400 text-sm text-center max-w-md mb-8">
                    <span className="text-slate-200 font-medium">{projectName}</span> has been
                    created. We&apos;ll start collecting mentions from{" "}
                    {selectedPlatforms.length} platform
                    {selectedPlatforms.length > 1 ? "s" : ""} right away.
                  </p>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    Go to Dashboard
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                // Fallback — should not normally appear
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mb-4" />
                  <p className="text-slate-300 text-sm">Setting things up...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
