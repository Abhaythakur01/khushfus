"use client";

import { useState } from "react";
import {
  Check,
  X,
  Loader2,
  ExternalLink,
  Settings2,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

type IntegrationStatus = "connected" | "not_connected" | "coming_soon";

interface Integration {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  logoPlaceholder: string;
  configFields?: ConfigField[];
  webhookUrl?: string;
  buttonLabel?: string;
}

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder: string;
  value: string;
}

const initialIntegrations: Integration[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description:
      "Sync mention data and sentiment scores with Salesforce CRM contacts and opportunities.",
    status: "connected",
    logoPlaceholder: "SF",
    configFields: [
      { key: "instanceUrl", label: "Instance URL", type: "url", placeholder: "https://yourorg.salesforce.com", value: "https://khushfus.salesforce.com" },
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter API key", value: "sf_xxxxxxxxxxxx" },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description:
      "Push sentiment-enriched contact data and mention activity into HubSpot CRM.",
    status: "not_connected",
    logoPlaceholder: "HS",
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Enter HubSpot API key", value: "" },
      { key: "portalId", label: "Portal ID", type: "text", placeholder: "Enter portal ID", value: "" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Receive real-time alert notifications and daily summaries in your Slack channels.",
    status: "connected",
    logoPlaceholder: "SL",
    buttonLabel: "Connect Workspace",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/...", value: "https://hooks.slack.com/services/T0XX/B0XX/xxxx" },
      { key: "channel", label: "Default Channel", type: "text", placeholder: "#alerts", value: "#brand-alerts" },
    ],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description:
      "Get alert notifications and reports delivered directly to Microsoft Teams channels.",
    status: "coming_soon",
    logoPlaceholder: "MT",
  },
  {
    id: "zapier",
    name: "Zapier",
    description:
      "Connect KhushFus to 5,000+ apps through Zapier automations and workflows.",
    status: "connected",
    logoPlaceholder: "ZP",
    webhookUrl: "https://hooks.zapier.com/hooks/catch/12345/abcdef/",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", type: "url", placeholder: "https://hooks.zapier.com/...", value: "https://hooks.zapier.com/hooks/catch/12345/abcdef/" },
    ],
  },
  {
    id: "tableau",
    name: "Tableau",
    description:
      "Export sentiment data and analytics to Tableau for advanced visualization and reporting.",
    status: "not_connected",
    logoPlaceholder: "TB",
    configFields: [
      { key: "serverUrl", label: "Server URL", type: "url", placeholder: "https://tableau.yourorg.com", value: "" },
      { key: "apiToken", label: "API Token", type: "password", placeholder: "Enter API token", value: "" },
      { key: "siteId", label: "Site ID", type: "text", placeholder: "Enter site ID", value: "" },
    ],
  },
  {
    id: "zendesk",
    name: "Zendesk",
    description:
      "Create and enrich support tickets automatically based on negative mention detection.",
    status: "coming_soon",
    logoPlaceholder: "ZD",
  },
  {
    id: "custom_webhook",
    name: "Custom Webhook",
    description:
      "Send real-time event data to any endpoint via configurable webhooks.",
    status: "not_connected",
    logoPlaceholder: "WH",
    configFields: [
      { key: "url", label: "Webhook URL", type: "url", placeholder: "https://your-api.com/webhook", value: "" },
      { key: "secret", label: "Signing Secret", type: "password", placeholder: "Enter webhook secret", value: "" },
    ],
  },
];

const statusStyles: Record<IntegrationStatus, string> = {
  connected: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  not_connected: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  coming_soon: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const statusLabels: Record<IntegrationStatus, string> = {
  connected: "Connected",
  not_connected: "Not Connected",
  coming_soon: "Coming Soon",
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [configId, setConfigId] = useState<string | null>(null);
  const [configFields, setConfigFields] = useState<ConfigField[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failure" | null>(null);
  const [enabled, setEnabled] = useState(true);

  const openConfig = (integration: Integration) => {
    setConfigId(integration.id);
    setConfigFields(
      (integration.configFields || []).map((f) => ({ ...f }))
    );
    setEnabled(integration.status === "connected");
    setTestResult(null);
    setTesting(false);
  };

  const updateField = (key: string, value: string) => {
    setConfigFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    );
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    await new Promise((r) => setTimeout(r, 1500));
    // Simulate success for connected integrations
    const integration = integrations.find((i) => i.id === configId);
    setTestResult(integration?.status === "connected" ? "success" : "success");
    setTesting(false);
  };

  const handleSaveConfig = () => {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id === configId) {
          return {
            ...i,
            status: enabled ? "connected" : "not_connected",
            configFields: configFields,
          };
        }
        return i;
      })
    );
    setConfigId(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect KhushFus with your existing tools and workflows.
        </p>
      </div>

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <Card key={integration.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {/* Logo placeholder */}
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="font-bold text-sm text-muted-foreground">
                    {integration.logoPlaceholder}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{integration.name}</h3>
                    <Badge className={cn("text-xs", statusStyles[integration.status])}>
                      {statusLabels[integration.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {integration.description}
                  </p>

                  {/* Webhook URL display for Zapier */}
                  {integration.webhookUrl && (
                    <div className="mb-3">
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                        {integration.webhookUrl}
                      </code>
                    </div>
                  )}

                  {integration.status !== "coming_soon" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openConfig(integration)}
                    >
                      <Settings2 className="mr-2 h-3.5 w-3.5" />
                      {integration.buttonLabel || "Configure"}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Coming Soon
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Configure Dialog */}
      {configId && (
        <Dialog open={!!configId} onOpenChange={() => setConfigId(null)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">
                Configure{" "}
                {integrations.find((i) => i.id === configId)?.name}
              </h2>

              <div className="space-y-4">
                {configFields.map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium mb-1 block">
                      {field.label}
                    </label>
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}

                {/* Enable/Disable toggle */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-medium">Enabled</span>
                  <button
                    onClick={() => setEnabled(!enabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      enabled ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        enabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>

                {/* Test Connection */}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="w-full"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Plug className="mr-2 h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>

                  {testResult === "success" && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-800 dark:text-green-300">
                        Connection successful
                      </span>
                    </div>
                  )}
                  {testResult === "failure" && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <X className="h-4 w-4 text-red-600" />
                      <span className="text-sm text-red-800 dark:text-red-300">
                        Connection failed. Check your credentials.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setConfigId(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveConfig}>Save</Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
