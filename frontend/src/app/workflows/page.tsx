"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Loader2,
  Workflow,
  Pencil,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Zap,
  Bell,
  Mail,
  Webhook,
  Flag,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Hash,
  Users,
  BarChart2,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api, type Workflow as WorkflowType, type WorkflowTrigger, type WorkflowAction, type WorkflowPayload } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Trigger definitions
// ---------------------------------------------------------------------------

type TriggerType = WorkflowTrigger["type"];
type ActionType = WorkflowAction["type"];

interface TriggerDef {
  type: TriggerType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  configField?: {
    key: string;
    label: string;
    placeholder: string;
    inputType: "text" | "number" | "range" | "select";
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
  };
}

interface ActionDef {
  type: ActionType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  configField?: {
    key: string;
    label: string;
    placeholder: string;
  };
}

const TRIGGER_DEFS: TriggerDef[] = [
  {
    type: "negative_influencer",
    label: "Negative Influencer",
    description: "Negative mention from high-follower account",
    icon: <Users className="h-5 w-5" />,
    color: "text-red-400",
    configField: {
      key: "min_followers",
      label: "Min. follower count",
      placeholder: "10000",
      inputType: "number",
    },
  },
  {
    type: "keyword_match",
    label: "Keyword Match",
    description: "Mention contains a specific keyword",
    icon: <Hash className="h-5 w-5" />,
    color: "text-blue-400",
    configField: {
      key: "keyword",
      label: "Keyword",
      placeholder: "e.g. outage, refund",
      inputType: "text",
    },
  },
  {
    type: "sentiment_below",
    label: "Sentiment Below",
    description: "Sentiment score drops below threshold",
    icon: <TrendingDown className="h-5 w-5" />,
    color: "text-orange-400",
    configField: {
      key: "threshold",
      label: "Threshold (−1 to 1)",
      placeholder: "-0.5",
      inputType: "number",
      min: -1,
      max: 1,
      step: 0.1,
    },
  },
  {
    type: "sentiment_above",
    label: "Sentiment Above",
    description: "Sentiment score rises above threshold",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "text-emerald-400",
    configField: {
      key: "threshold",
      label: "Threshold (−1 to 1)",
      placeholder: "0.5",
      inputType: "number",
      min: -1,
      max: 1,
      step: 0.1,
    },
  },
  {
    type: "platform_match",
    label: "Platform Match",
    description: "Mention from a specific platform",
    icon: <Zap className="h-5 w-5" />,
    color: "text-purple-400",
    configField: {
      key: "platform",
      label: "Platform",
      placeholder: "twitter",
      inputType: "select",
      options: [
        { value: "twitter", label: "Twitter / X" },
        { value: "reddit", label: "Reddit" },
        { value: "linkedin", label: "LinkedIn" },
        { value: "facebook", label: "Facebook" },
        { value: "instagram", label: "Instagram" },
        { value: "tiktok", label: "TikTok" },
        { value: "youtube", label: "YouTube" },
        { value: "news", label: "News" },
        { value: "mastodon", label: "Mastodon" },
        { value: "bluesky", label: "Bluesky" },
      ],
    },
  },
  {
    type: "high_engagement",
    label: "High Engagement",
    description: "Mention has unusually high engagement",
    icon: <BarChart2 className="h-5 w-5" />,
    color: "text-yellow-400",
    configField: {
      key: "min_engagement",
      label: "Min. engagement count",
      placeholder: "500",
      inputType: "number",
    },
  },
];

const ACTION_DEFS: ActionDef[] = [
  {
    type: "notify_slack",
    label: "Slack Notification",
    description: "Send a message to a Slack webhook",
    icon: <Bell className="h-5 w-5" />,
    color: "text-emerald-400",
    configField: {
      key: "webhook_url",
      label: "Slack Webhook URL",
      placeholder: "https://hooks.slack.com/services/...",
    },
  },
  {
    type: "notify_email",
    label: "Email Alert",
    description: "Send an email alert to an address",
    icon: <Mail className="h-5 w-5" />,
    color: "text-blue-400",
    configField: {
      key: "email",
      label: "Email address",
      placeholder: "team@example.com",
    },
  },
  {
    type: "flag_mention",
    label: "Auto-flag Mention",
    description: "Automatically flag the mention for review",
    icon: <Flag className="h-5 w-5" />,
    color: "text-orange-400",
  },
  {
    type: "escalate",
    label: "Escalate to Webhook",
    description: "POST mention payload to a custom webhook",
    icon: <Webhook className="h-5 w-5" />,
    color: "text-purple-400",
    configField: {
      key: "webhook_url",
      label: "Webhook URL",
      placeholder: "https://your-endpoint.example.com/escalate",
    },
  },
];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function triggerSummary(triggers: WorkflowTrigger[]): string {
  if (!triggers || triggers.length === 0) return "No triggers";
  return triggers
    .map((t) => TRIGGER_DEFS.find((d) => d.type === t.type)?.label ?? t.type)
    .join(", ");
}

function actionSummary(actions: WorkflowAction[]): string {
  if (!actions || actions.length === 0) return "No actions";
  return actions
    .map((a) => ACTION_DEFS.find((d) => d.type === a.type)?.label ?? a.type)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Workflow Builder — step types
// ---------------------------------------------------------------------------

type BuilderStep = 1 | 2 | 3 | 4;

interface TriggerEntry {
  id: string;
  type: TriggerType;
  configValue: string;
}

interface ActionEntry {
  id: string;
  type: ActionType;
  configValue: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function entryToTrigger(e: TriggerEntry): WorkflowTrigger {
  const def = TRIGGER_DEFS.find((d) => d.type === e.type)!;
  const config: Record<string, string | number> = {};
  if (def.configField && e.configValue) {
    const val = def.configField.inputType === "number"
      ? Number(e.configValue)
      : e.configValue;
    config[def.configField.key] = val;
  }
  return { type: e.type, config };
}

function entryToAction(e: ActionEntry): WorkflowAction {
  const def = ACTION_DEFS.find((d) => d.type === e.type)!;
  const config: Record<string, string> = {};
  if (def.configField && e.configValue) {
    config[def.configField.key] = e.configValue;
  }
  return { type: e.type, config };
}

function triggerToEntry(t: WorkflowTrigger): TriggerEntry {
  const def = TRIGGER_DEFS.find((d) => d.type === t.type)!;
  const val = def?.configField ? String(t.config?.[def.configField.key] ?? "") : "";
  return { id: generateId(), type: t.type, configValue: val };
}

function actionToEntry(a: WorkflowAction): ActionEntry {
  const def = ACTION_DEFS.find((d) => d.type === a.type)!;
  const val = def?.configField ? String(a.config?.[def.configField.key] ?? "") : "";
  return { id: generateId(), type: a.type, configValue: val };
}

// ---------------------------------------------------------------------------
// TriggerCard sub-component
// ---------------------------------------------------------------------------

function TriggerCard({
  def,
  selected,
  onSelect,
}: {
  def: TriggerDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-indigo-500 bg-indigo-500/[0.08]"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("shrink-0", def.color)}>{def.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200">{def.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>
        </div>
        {selected && (
          <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-indigo-400" />
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ActionCard sub-component
// ---------------------------------------------------------------------------

function ActionCard({
  def,
  selected,
  onSelect,
}: {
  def: ActionDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-indigo-500 bg-indigo-500/[0.08]"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("shrink-0", def.color)}>{def.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200">{def.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>
        </div>
        {selected && (
          <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-indigo-400" />
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Workflow Builder Dialog
// ---------------------------------------------------------------------------

interface BuilderDialogProps {
  open: boolean;
  onClose: () => void;
  editing: WorkflowType | null;
  onSaved: () => void;
}

function BuilderDialog({ open, onClose, editing, onSaved }: BuilderDialogProps) {
  const [step, setStep] = useState<BuilderStep>(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 — triggers
  const [triggers, setTriggers] = useState<TriggerEntry[]>([]);

  // Step 3 — actions
  const [actions, setActions] = useState<ActionEntry[]>([]);

  // Populate form from `editing` workflow when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(1);
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setTriggers((editing.triggers ?? []).map(triggerToEntry));
      setActions((editing.actions ?? []).map(actionToEntry));
    } else {
      setName("");
      setDescription("");
      setTriggers([]);
      setActions([]);
    }
  }, [open, editing]);

  const toggleTriggerType = (type: TriggerType) => {
    setTriggers((prev) => {
      const exists = prev.find((t) => t.type === type);
      if (exists) return prev.filter((t) => t.type !== type);
      return [...prev, { id: generateId(), type, configValue: "" }];
    });
  };

  const updateTriggerConfig = (id: string, value: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, configValue: value } : t))
    );
  };

  const toggleActionType = (type: ActionType) => {
    setActions((prev) => {
      const exists = prev.find((a) => a.type === type);
      if (exists) return prev.filter((a) => a.type !== type);
      return [...prev, { id: generateId(), type, configValue: "" }];
    });
  };

  const updateActionConfig = (id: string, value: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, configValue: value } : a))
    );
  };

  const canGoNext = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return triggers.length > 0;
    if (step === 3) return actions.length > 0;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: WorkflowPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      is_active: true,
      triggers: triggers.map(entryToTrigger),
      actions: actions.map(entryToAction),
    };
    try {
      if (editing) {
        await api.updateWorkflow(editing.id, payload);
        toast.success("Workflow updated");
      } else {
        await api.createWorkflow(payload);
        toast.success("Workflow created");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error("Failed to save workflow:", err);
      toast.error(editing ? "Failed to update workflow" : "Failed to create workflow");
    } finally {
      setSaving(false);
    }
  };

  const STEP_LABELS = ["Details", "Triggers", "Actions", "Review"];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="bg-[#111827]/70 border border-white/[0.08] max-w-2xl"
    >
      <DialogHeader onClose={onClose} className="border-white/[0.08]">
        <div className="flex items-center gap-4">
          <span className="text-slate-100">
            {editing ? "Edit Workflow" : "New Workflow"}
          </span>
          {/* Step indicator */}
          <div className="flex items-center gap-1.5">
            {STEP_LABELS.map((label, i) => {
              const s = (i + 1) as BuilderStep;
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-colors",
                      s === step
                        ? "bg-indigo-500 text-white"
                        : s < step
                        ? "bg-indigo-500/30 text-indigo-300"
                        : "bg-white/[0.08] text-slate-500"
                    )}
                  >
                    {s < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={cn(
                        "h-px w-4 transition-colors",
                        s < step ? "bg-indigo-500/40" : "bg-white/[0.08]"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-0 py-0 max-h-[60vh] overflow-y-auto">
        {/* ── Step 1: Details ── */}
        {step === 1 && (
          <div className="space-y-4 py-5">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                Workflow Name <span className="text-red-400">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Crisis Alert Response"
                className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                Description{" "}
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
                className="resize-none bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Triggers ── */}
        {step === 2 && (
          <div className="space-y-3 py-5">
            <p className="text-xs text-slate-500 -mt-1 mb-3">
              Select one or more triggers. The workflow fires when{" "}
              <span className="text-slate-300 font-medium">any</span> trigger condition is met.
            </p>
            {TRIGGER_DEFS.map((def) => {
              const entry = triggers.find((t) => t.type === def.type);
              return (
                <div key={def.type} className="space-y-2">
                  <TriggerCard
                    def={def}
                    selected={!!entry}
                    onSelect={() => toggleTriggerType(def.type)}
                  />
                  {entry && def.configField && (
                    <div className="ml-4 pl-4 border-l-2 border-indigo-500/30">
                      <label className="text-xs font-medium text-slate-400 mb-1 block">
                        {def.configField.label}
                      </label>
                      {def.configField.inputType === "select" ? (
                        <Select
                          value={entry.configValue}
                          onValueChange={(v) => updateTriggerConfig(entry.id, v)}
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 text-sm"
                        >
                          <option value="">Select platform…</option>
                          {def.configField.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type={def.configField.inputType}
                          value={entry.configValue}
                          onChange={(e) =>
                            updateTriggerConfig(entry.id, e.target.value)
                          }
                          placeholder={def.configField.placeholder}
                          min={def.configField.min}
                          max={def.configField.max}
                          step={def.configField.step}
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500 text-sm"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 3: Actions ── */}
        {step === 3 && (
          <div className="space-y-3 py-5">
            <p className="text-xs text-slate-500 -mt-1 mb-3">
              Select one or more actions to execute when the workflow triggers.
            </p>
            {ACTION_DEFS.map((def) => {
              const entry = actions.find((a) => a.type === def.type);
              return (
                <div key={def.type} className="space-y-2">
                  <ActionCard
                    def={def}
                    selected={!!entry}
                    onSelect={() => toggleActionType(def.type)}
                  />
                  {entry && def.configField && (
                    <div className="ml-4 pl-4 border-l-2 border-indigo-500/30">
                      <label className="text-xs font-medium text-slate-400 mb-1 block">
                        {def.configField.label}
                      </label>
                      <Input
                        value={entry.configValue}
                        onChange={(e) =>
                          updateActionConfig(entry.id, e.target.value)
                        }
                        placeholder={def.configField.placeholder}
                        className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500 text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
          <div className="space-y-4 py-5">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Name</p>
                <p className="text-sm text-slate-200 font-medium">{name}</p>
              </div>
              {description && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-slate-300">{description}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Triggers ({triggers.length})
                </p>
                <div className="space-y-1.5">
                  {triggers.map((t) => {
                    const def = TRIGGER_DEFS.find((d) => d.type === t.type)!;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 text-sm text-slate-300"
                      >
                        <span className={cn("shrink-0", def.color)}>{def.icon}</span>
                        <span>{def.label}</span>
                        {t.configValue && (
                          <span className="text-slate-500">
                            — {def.configField?.label}: {t.configValue}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Actions ({actions.length})
                </p>
                <div className="space-y-1.5">
                  {actions.map((a) => {
                    const def = ACTION_DEFS.find((d) => d.type === a.type)!;
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 text-sm text-slate-300"
                      >
                        <span className={cn("shrink-0", def.color)}>{def.icon}</span>
                        <span>{def.label}</span>
                        {a.configValue && (
                          <span className="text-slate-500 truncate max-w-[220px]">
                            — {a.configValue}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center">
              The workflow will be created as{" "}
              <span className="text-emerald-400 font-medium">active</span>. You can pause it at any time.
            </p>
          </div>
        )}
      </DialogContent>

      <DialogFooter className="border-white/[0.08] bg-[#111827]/70">
        {step > 1 ? (
          <Button
            variant="outline"
            onClick={() => setStep((s) => (s - 1) as BuilderStep)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
        )}

        {step < 4 ? (
          <Button
            onClick={() => setStep((s) => (s + 1) as BuilderStep)}
            disabled={!canGoNext()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Next
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Create Workflow"}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  workflow,
  onClose,
  onDeleted,
}: {
  workflow: WorkflowType | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!workflow) return;
    setDeleting(true);
    try {
      await api.deleteWorkflow(workflow.id);
      toast.success("Workflow deleted");
      onDeleted();
      onClose();
    } catch (err: unknown) {
      console.error("Failed to delete workflow:", err);
      toast.error("Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={!!workflow}
      onClose={onClose}
      className="bg-[#111827]/70 border border-white/[0.08]"
    >
      <DialogHeader onClose={onClose} className="border-white/[0.08]">
        <span className="text-slate-100">Delete Workflow</span>
      </DialogHeader>
      <DialogContent>
        <div className="flex gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm text-slate-300">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-100">{workflow?.name}</span>?
            </p>
            <p className="text-xs text-slate-500 mt-1">
              This action cannot be undone and will immediately stop all automations.
            </p>
          </div>
        </div>
      </DialogContent>
      <DialogFooter className="border-white/[0.08] bg-[#111827]/70">
        <Button
          variant="outline"
          onClick={onClose}
          className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
        >
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WorkflowCard
// ---------------------------------------------------------------------------

function WorkflowCard({
  workflow,
  onEdit,
  onDelete,
  onToggle,
}: {
  workflow: WorkflowType;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4 hover:border-white/[0.10] transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0 mt-0.5">
          <Workflow className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-100 truncate">
              {workflow.name}
            </h3>
            <Badge
              className={cn(
                "capitalize border text-[11px] px-1.5 py-0",
                workflow.is_active
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/20"
              )}
            >
              {workflow.is_active ? "Active" : "Paused"}
            </Badge>
          </div>
          {workflow.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
              {workflow.description}
            </p>
          )}
        </div>
      </div>

      {/* Triggers / Actions summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.05] p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            Triggers
          </p>
          <p className="text-xs text-slate-300 line-clamp-2">
            {triggerSummary(workflow.triggers)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.05] p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            Actions
          </p>
          <p className="text-xs text-slate-300 line-clamp-2">
            {actionSummary(workflow.actions)}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-slate-600">
          {workflow.last_triggered_at
            ? `Last triggered ${formatDate(workflow.last_triggered_at)}`
            : "Never triggered"}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            title={workflow.is_active ? "Pause workflow" : "Resume workflow"}
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {workflow.is_active ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onEdit}
            title="Edit workflow"
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Delete workflow"
            className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowType | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkflows();
      setWorkflows(data ?? []);
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const openCreate = () => {
    setEditingWorkflow(null);
    setBuilderOpen(true);
  };

  const openEdit = (wf: WorkflowType) => {
    setEditingWorkflow(wf);
    setBuilderOpen(true);
  };

  const handleToggle = async (wf: WorkflowType) => {
    try {
      await api.updateWorkflow(wf.id, { is_active: !wf.is_active });
      toast.success(wf.is_active ? "Workflow paused" : "Workflow resumed");
      fetchWorkflows();
    } catch (err: unknown) {
      console.error("Failed to toggle workflow:", err);
      toast.error("Failed to update workflow");
    }
  };

  const activeCount = workflows.filter((w) => w.is_active).length;
  const pausedCount = workflows.length - activeCount;

  return (
    <AppShell title="Workflows">
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              Workflow Automation
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Automate responses to mention events with trigger-action workflows.
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>

        {/* Stats row */}
        {!loading && workflows.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total", value: workflows.length, color: "text-slate-100" },
              { label: "Active", value: activeCount, color: "text-emerald-400" },
              { label: "Paused", value: pausedCount, color: "text-slate-400" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="border-white/[0.06] bg-white/[0.03]">
                <CardContent className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className={cn("text-2xl font-semibold", color)}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Workflow grid */}
        <Card>
          <CardHeader className="border-white/[0.06] flex flex-row items-center justify-between">
            <CardTitle className="text-slate-100">All Workflows</CardTitle>
            {workflows.length > 0 && (
              <span className="text-xs text-slate-500">{workflows.length} total</span>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 mb-4">
                  <Workflow className="h-7 w-7 text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-slate-300">
                  No workflows yet
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Create your first workflow to automatically respond to mention
                  events — alert your team, flag mentions, or escalate issues.
                </p>
                <Button
                  onClick={openCreate}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Workflow
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {workflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    onEdit={() => openEdit(wf)}
                    onDelete={() => setDeleteTarget(wf)}
                    onToggle={() => handleToggle(wf)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Builder dialog */}
      <BuilderDialog
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        editing={editingWorkflow}
        onSaved={fetchWorkflows}
      />

      {/* Delete confirmation */}
      <DeleteDialog
        workflow={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={fetchWorkflows}
      />
    </AppShell>
  );
}
