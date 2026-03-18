"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";
import { Sparkles, X, Send, Bot, User, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  used_llm?: boolean;
}

// ---------------------------------------------------------------------------
// Suggested prompts shown when the conversation is empty
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  "What's the sentiment trend?",
  "Summarize recent mentions",
  "Any crisis risks?",
  "Top influencers this week",
] as const;

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1" aria-label="AI is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div
      className={cn(
        "flex gap-2.5 items-start",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isUser
            ? "bg-indigo-600/70 text-white"
            : "bg-slate-700/80 border border-slate-600/50 text-indigo-300",
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-indigo-600/80 text-white rounded-tr-sm"
            : "bg-slate-800/90 border border-slate-700/50 text-slate-200 rounded-tl-sm",
        )}
      >
        {/* Render markdown-style bold (**text**) */}
        {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, idx) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={idx} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={idx} className="whitespace-pre-line">
              {part}
            </span>
          ),
        )}
        {/* LLM badge */}
        {!isUser && msg.used_llm && (
          <span className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-400/70">
            <Sparkles className="h-2.5 w-2.5" /> AI-powered
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSuggestion, setHasSuggestion] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch projects so the user can pick one (or we auto-select the first)
  const { projects } = useProjects();

  // Auto-select the first project when projects load
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Dismiss the pulse suggestion after the panel is first opened
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasSuggestion(false);
  }, []);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isLoading) return;

      const projectId = selectedProjectId;
      if (!projectId) {
        appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Please select a project first so I can look up your mention data.",
          timestamp: new Date(),
        });
        return;
      }

      // Add user message
      appendMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      });

      setInput("");
      setIsLoading(true);

      // Cancel any previous in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await api.askCopilot(projectId, trimmed, abortRef.current.signal);
        appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.answer,
          timestamp: new Date(),
          used_llm: res.used_llm,
        });
      } catch (err: unknown) {
        // Ignore abort errors (user cancelled or component unmounted)
        if (err instanceof DOMException && err.name === "AbortError") return;

        const message =
          err && typeof err === "object" && "safeMessage" in err
            ? String((err as { safeMessage: string }).safeMessage)
            : "Something went wrong. Please try again.";

        appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Sorry, I couldn't get an answer right now. ${message}`,
          timestamp: new Date(),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, selectedProjectId, appendMessage],
  );

  const handleSend = useCallback(() => sendMessage(input), [sendMessage, input]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
    },
    [sendMessage],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const isEmpty = messages.length === 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Collapsed: floating action button                                   */}
      {/* ------------------------------------------------------------------ */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          aria-label="Open AI Copilot"
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "flex h-12 w-12 items-center justify-center rounded-full",
            "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30",
            "hover:bg-indigo-500 active:scale-95",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1a]",
          )}
        >
          <Sparkles className="h-5 w-5" />
          {/* Pulse ring when there is a pending suggestion */}
          {hasSuggestion && (
            <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500/40 pointer-events-none" />
          )}
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Expanded: chat panel                                                */}
      {/* ------------------------------------------------------------------ */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="AI Copilot"
          aria-modal="true"
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "flex flex-col",
            "w-[400px] h-[520px]",
            "rounded-2xl overflow-hidden",
            "bg-[#0e1420] border border-slate-700/50",
            "shadow-2xl shadow-black/50",
          )}
        >
          {/* ---- Header ---- */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/80">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 leading-none">AI Copilot</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Ask about your mentions</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Project selector */}
              {projects.length > 1 && (
                <div className="relative mr-1">
                  <select
                    value={selectedProjectId ?? ""}
                    onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                    className={cn(
                      "appearance-none bg-slate-800/80 border border-slate-700/50 rounded-lg",
                      "text-xs text-slate-300 pl-2 pr-6 py-1",
                      "focus:outline-none focus:ring-1 focus:ring-indigo-500/50",
                      "cursor-pointer max-w-[120px] truncate",
                    )}
                    aria-label="Select project"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
                </div>
              )}

              {/* Minimise */}
              <button
                onClick={handleClose}
                aria-label="Close AI Copilot"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ---- Message area ---- */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {isEmpty && !isLoading ? (
              /* Suggested prompts when empty */
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30">
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">How can I help?</p>
                  <p className="text-xs text-slate-500 max-w-[240px]">
                    Ask me anything about your brand mentions and social data.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSuggestedPrompt(prompt)}
                      className={cn(
                        "text-left px-3 py-2.5 rounded-xl text-xs text-slate-300",
                        "bg-slate-800/60 border border-slate-700/50",
                        "hover:bg-slate-700/60 hover:border-indigo-500/30 hover:text-slate-100",
                        "transition-all duration-150",
                        "line-clamp-2",
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {isLoading && (
                  <div className="flex gap-2.5 items-start">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700/80 border border-slate-600/50 text-indigo-300">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-slate-800/90 border border-slate-700/50 px-3.5 py-2.5">
                      <TypingDots />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ---- Input bar ---- */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-slate-700/50 bg-slate-900/40">
            <div className="flex items-end gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your mentions…"
                rows={1}
                disabled={isLoading}
                aria-label="Message to AI Copilot"
                className={cn(
                  "flex-1 resize-none bg-transparent text-sm text-slate-200",
                  "placeholder:text-slate-500 focus:outline-none",
                  "max-h-[80px] leading-relaxed py-0.5",
                  "disabled:opacity-50",
                )}
                style={{ overflowY: input.split("\n").length > 2 ? "auto" : "hidden" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                  "bg-indigo-600 text-white",
                  "hover:bg-indigo-500 active:scale-95",
                  "disabled:opacity-40 disabled:pointer-events-none",
                  "transition-all duration-150",
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-1.5">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
