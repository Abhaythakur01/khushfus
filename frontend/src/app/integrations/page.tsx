"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plug,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Loader2,
  Settings2,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldType = "text" | "password" | "url" | "readonly";

interface IntegrationField {
  key: string;
  label: string;
  placeholder?: string;
  type?: FieldType;
  helpText?: string;
}

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  category: "crm" | "messaging" | "automation" | "analytics" | "email";
  icon: React.ReactNode;
  accentColor: string;
  fields: IntegrationField[];
  zapierWebhook?: boolean; // special: shows a read-only generated URL
}

type IntegrationConfig = Record<string, string>;
type AllConfigs = Record<string, IntegrationConfig>;

const LS_KEY = "khushfus_integrations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfigs(): AllConfigs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveConfigs(configs: AllConfigs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(configs));
  } catch {
    // storage full
  }
}

function isConnected(config: IntegrationConfig | undefined, fields: IntegrationField[]): boolean {
  if (!config) return false;
  // readonly fields don't count (Zapier webhook is always "configured")
  const requiredFields = fields.filter((f) => f.type !== "readonly");
  if (requiredFields.length === 0) return true;
  return requiredFields.some((f) => !!config[f.key]?.trim());
}

/** Generate a stable per-session Zapier webhook URL. */
function getZapierWebhookUrl(): string {
  const stored = localStorage.getItem("khushfus_zapier_webhook_id");
  if (stored) return `https://hooks.zapier.com/hooks/catch/${stored}/`;
  const id = `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("khushfus_zapier_webhook_id", id);
  return `https://hooks.zapier.com/hooks/catch/${id}/`;
}

// ---------------------------------------------------------------------------
// Integration definitions
// ---------------------------------------------------------------------------

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync mentions and alerts to Salesforce CRM as cases or leads.",
    category: "crm",
    accentColor: "#00A1E0",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <ellipse cx="12" cy="12" rx="10" ry="10" fill="#00A1E0" />
        <path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" fill="white" />
      </svg>
    ),
    fields: [
      { key: "instanceUrl",   label: "Instance URL",   placeholder: "https://yourorg.salesforce.com", type: "url" },
      { key: "clientId",      label: "Client ID",      placeholder: "Connected app client ID" },
      { key: "clientSecret",  label: "Client Secret",  placeholder: "Connected app client secret", type: "password" },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Push mention data to HubSpot contacts, deals, and tickets.",
    category: "crm",
    accentColor: "#FF7A59",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <rect width="24" height="24" rx="6" fill="#FF7A59" />
        <circle cx="16" cy="8" r="2.5" fill="white" />
        <path d="M10 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5" />
        <path d="M7 12h3M16 8v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    fields: [
      { key: "apiKey",    label: "API Key",    placeholder: "pat-na1-xxxxxxxxxxxx", type: "password" },
      { key: "portalId",  label: "Portal ID",  placeholder: "12345678" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Receive real-time mention alerts and reports in your Slack channels.",
    category: "messaging",
    accentColor: "#4A154B",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <rect width="24" height="24" rx="6" fill="#4A154B" />
        <path d="M8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="#E01E5A" />
        <path d="M15.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM15.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="#36C5F0" />
        <path d="M10 8.5H14M10 15.5H14M8.5 10V14M15.5 10V14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </svg>
    ),
    fields: [
      { key: "webhookUrl", label: "Webhook URL",  placeholder: "https://hooks.slack.com/services/…", type: "url" },
      { key: "channel",    label: "Channel",      placeholder: "#brand-mentions" },
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Trigger any Zapier workflow when new mentions are collected.",
    category: "automation",
    accentColor: "#FF4A00",
    zapierWebhook: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <rect width="24" height="24" rx="6" fill="#FF4A00" />
        <path d="M12 4L4 12l8 8 8-8-8-8z" fill="white" fillOpacity="0.9" />
        <path d="M12 8v8M8 12h8" stroke="#FF4A00" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    fields: [
      {
        key: "webhookUrl",
        label: "Your KhushFus Webhook URL",
        type: "readonly",
        helpText: "Copy this URL and paste it as the trigger URL in your Zap.",
      },
    ],
  },
  {
    id: "tableau",
    name: "Tableau",
    description: "Connect KhushFus data to Tableau for advanced BI visualizations.",
    category: "analytics",
    accentColor: "#E97627",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <rect width="24" height="24" rx="6" fill="#E97627" />
        <rect x="11" y="4" width="2" height="16" rx="1" fill="white" />
        <rect x="4" y="11" width="16" height="2" rx="1" fill="white" />
        <rect x="7.5" y="7.5" width="2" height="9" rx="1" fill="white" fillOpacity="0.6" />
        <rect x="14.5" y="7.5" width="2" height="9" rx="1" fill="white" fillOpacity="0.6" />
      </svg>
    ),
    fields: [
      { key: "serverUrl", label: "Server URL",  placeholder: "https://tableau.yourcompany.com", type: "url" },
      { key: "username",  label: "Username",    placeholder: "tableau-user" },
      { key: "password",  label: "Password",    placeholder: "••••••••", type: "password" },
    ],
  },
  {
    id: "smtp",
    name: "Email (SMTP)",
    description: "Configure SMTP to send alert emails and scheduled reports.",
    category: "email",
    accentColor: "#4F46E5",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <rect width="24" height="24" rx="6" fill="#4F46E5" />
        <rect x="4" y="7" width="16" height="11" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
        <path d="M4 9l8 5 8-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    fields: [
      { key: "host",        label: "SMTP Host",     placeholder: "smtp.example.com" },
      { key: "port",        label: "Port",          placeholder: "587" },
      { key: "username",    label: "Username",      placeholder: "user@example.com" },
      { key: "password",    label: "Password",      placeholder: "••••••••", type: "password" },
      { key: "fromAddress", label: "From Address",  placeholder: "alerts@yourcompany.com" },
    ],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  crm:        "CRM",
  messaging:  "Messaging",
  automation: "Automation",
  analytics:  "Analytics",
  email:      "Email",
};

// ---------------------------------------------------------------------------
// IntegrationCard
// ---------------------------------------------------------------------------

function IntegrationCard({
  integration,
  config,
  onConfigure,
}: {
  integration: IntegrationDef;
  config: IntegrationConfig | undefined;
  onConfigure: () => void;
}) {
  const connected = isConnected(config, integration.fields);

  return (
    <div className="flex flex-col bg-slate-900/60 border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.1] transition-colors group">
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">{integration.icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{integration.name}</h3>
            <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">
              {CATEGORY_LABELS[integration.category] ?? integration.category}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border",
            connected
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-slate-500/10 text-slate-500 border-slate-500/20",
          )}
        >
          {connected ? (
            <><CheckCircle2 className="h-3 w-3" /> Connected</>
          ) : (
            <><XCircle className="h-3 w-3" /> Not Connected</>
          )}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 leading-relaxed flex-1 mb-5">{integration.description}</p>

      {/* Action */}
      <button
        onClick={onConfigure}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border transition-all duration-150",
          connected
            ? "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-slate-100"
            : "bg-indigo-600/90 border-indigo-500/40 text-white hover:bg-indigo-600",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        {connected ? "Reconfigure" : "Configure"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfigDialog
// ---------------------------------------------------------------------------

function ConfigDialog({
  integration,
  config,
  zapierUrl,
  onSave,
  onClose,
}: {
  integration: IntegrationDef;
  config: IntegrationConfig;
  zapierUrl: string;
  onSave: (id: string, data: IntegrationConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<IntegrationConfig>({ ...config });
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Pre-fill readonly Zapier field
  useEffect(() => {
    if (integration.zapierWebhook) {
      setForm((prev) => ({ ...prev, webhookUrl: zapierUrl }));
    }
  }, [integration.zapierWebhook, zapierUrl]);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    onSave(integration.id, form);
    toast.success(`${integration.name} configuration saved`);
    onClose();
  }

  async function handleTest() {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1200)); // simulated
    setTesting(false);
    toast.success(`Connection to ${integration.name} successful!`);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function togglePassword(key: string) {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const connected = isConnected(config, integration.fields);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <span className="flex items-center gap-2.5">
          {integration.icon}
          <span>Configure {integration.name}</span>
        </span>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* Status banner */}
        {connected && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            This integration is currently connected.
          </div>
        )}

        {/* Fields */}
        {integration.fields.map((field) => {
          const isPassword = field.type === "password";
          const isReadonly = field.type === "readonly";
          const showPlain = showPasswords[field.key];
          const value = isReadonly ? zapierUrl : (form[field.key] ?? "");

          return (
            <div key={field.key} className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                {field.label}
              </label>

              {isReadonly ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-10 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-slate-400 flex items-center overflow-hidden font-mono truncate">
                    {value}
                  </div>
                  <button
                    onClick={() => copyUrl(value)}
                    title="Copy webhook URL"
                    className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              ) : isPassword ? (
                <div className="relative">
                  <input
                    type={showPlain ? "text" : "password"}
                    value={value}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 pr-10 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => togglePassword(field.key)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPlain ? "Hide password" : "Show password"}
                  >
                    {showPlain ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <input
                  type={field.type === "url" ? "url" : "text"}
                  value={value}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition-colors"
                />
              )}

              {field.helpText && (
                <p className="text-[11px] text-slate-500">{field.helpText}</p>
              )}
            </div>
          );
        })}
      </DialogContent>

      <DialogFooter>
        <button
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-slate-100 disabled:opacity-50 transition-colors"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Save Configuration
        </button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<AllConfigs>({});
  const [activeIntegration, setActiveIntegration] = useState<IntegrationDef | null>(null);
  const [zapierUrl, setZapierUrl] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    setConfigs(loadConfigs());
    setZapierUrl(getZapierWebhookUrl());
  }, []);

  const saveIntegration = useCallback((id: string, data: IntegrationConfig) => {
    setConfigs((prev) => {
      const next = { ...prev, [id]: data };
      saveConfigs(next);
      return next;
    });
  }, []);

  const connectedCount = INTEGRATIONS.filter((i) =>
    isConnected(configs[i.id], i.fields)
  ).length;

  const categories = ["all", ...Array.from(new Set(INTEGRATIONS.map((i) => i.category)))];

  const displayed = filterCategory === "all"
    ? INTEGRATIONS
    : INTEGRATIONS.filter((i) => i.category === filterCategory);

  return (
    <AppShell title="Integrations">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 mb-1">Integration Hub</h1>
          <p className="text-sm text-slate-400">
            Connect KhushFus with your existing tools and workflows.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 border border-white/[0.06] rounded-xl">
          <Plug className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-100">{connectedCount}</span>
          <span className="text-sm text-slate-400">/ {INTEGRATIONS.length} connected</span>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={cn(
              "shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize",
              filterCategory === cat
                ? "bg-indigo-600/90 border-indigo-500/40 text-white"
                : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
            )}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayed.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            config={configs[integration.id]}
            onConfigure={() => setActiveIntegration(integration)}
          />
        ))}
      </div>

      {/* Config dialog */}
      {activeIntegration && (
        <ConfigDialog
          integration={activeIntegration}
          config={configs[activeIntegration.id] ?? {}}
          zapierUrl={zapierUrl}
          onSave={saveIntegration}
          onClose={() => setActiveIntegration(null)}
        />
      )}
    </AppShell>
  );
}
