"use client";

import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Mail,
  MessageSquare,
  Webhook,
  Loader2,
  Bell,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type AlertRuleType = "volume_spike" | "negative_surge" | "influencer" | "keyword_surge";
type Severity = "critical" | "high" | "medium" | "low";
type Channel = "email" | "slack" | "webhook";

interface AlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  threshold: number;
  windowMinutes: number;
  channels: Channel[];
  webhookUrl?: string;
  active: boolean;
}

interface AlertLogEntry {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  projectName: string;
  acknowledged: boolean;
  createdAt: string;
}

const ruleTypeLabels: Record<AlertRuleType, string> = {
  volume_spike: "Volume Spike",
  negative_surge: "Negative Surge",
  influencer: "Influencer",
  keyword_surge: "Keyword Surge",
};

const ruleTypeBadgeStyles: Record<AlertRuleType, string> = {
  volume_spike: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  negative_surge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  influencer: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  keyword_surge: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const severityStyles: Record<Severity, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const channelIcons: Record<Channel, typeof Mail> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
};

const mockRules: AlertRule[] = [
  { id: "1", name: "High Volume Alert", type: "volume_spike", threshold: 200, windowMinutes: 30, channels: ["email", "slack"], active: true },
  { id: "2", name: "Negative Sentiment Surge", type: "negative_surge", threshold: 50, windowMinutes: 15, channels: ["email", "slack", "webhook"], webhookUrl: "https://hooks.example.com/alert", active: true },
  { id: "3", name: "Influencer Mention", type: "influencer", threshold: 100000, windowMinutes: 60, channels: ["email"], active: true },
  { id: "4", name: "Product Keyword Spike", type: "keyword_surge", threshold: 100, windowMinutes: 20, channels: ["slack"], active: false },
  { id: "5", name: "Crisis Detection", type: "negative_surge", threshold: 25, windowMinutes: 10, channels: ["email", "slack", "webhook"], webhookUrl: "https://hooks.example.com/crisis", active: true },
];

const mockAlertLog: AlertLogEntry[] = [
  { id: "a1", severity: "critical", title: "Massive negative spike detected", description: "Negative mentions increased by 340% in the last 10 minutes across Twitter and Reddit, primarily related to service outage reports.", projectName: "Brand Monitor", acknowledged: false, createdAt: "2026-03-07T08:45:00Z" },
  { id: "a2", severity: "high", title: "Influencer @techguru mentioned brand", description: "Influencer with 2.3M followers posted a critical review of the latest product update on Twitter.", projectName: "Product Launch", acknowledged: true, createdAt: "2026-03-07T07:30:00Z" },
  { id: "a3", severity: "medium", title: "Volume spike on keyword 'pricing'", description: "Mentions containing 'pricing' increased by 150% in a 20-minute window across all tracked platforms.", projectName: "Competitor Watch", acknowledged: false, createdAt: "2026-03-07T06:15:00Z" },
  { id: "a4", severity: "low", title: "Weekly mention threshold reached", description: "Total weekly mentions have reached 80% of the configured threshold for the Brand Monitor project.", projectName: "Brand Monitor", acknowledged: true, createdAt: "2026-03-06T22:00:00Z" },
  { id: "a5", severity: "high", title: "Negative surge in Reddit mentions", description: "Reddit mentions turned 72% negative in the past 15 minutes, centered around r/technology subreddit.", projectName: "Brand Monitor", acknowledged: false, createdAt: "2026-03-06T18:30:00Z" },
  { id: "a6", severity: "medium", title: "Keyword 'bug' trending in mentions", description: "The keyword 'bug' appeared in 45 mentions within a 20-minute window, up from the baseline of 5.", projectName: "Product Launch", acknowledged: true, createdAt: "2026-03-06T15:00:00Z" },
  { id: "a7", severity: "critical", title: "Service-related negative spike", description: "Service-related negative mentions spiked 500% in 5 minutes. Possible outage being reported by users.", projectName: "Brand Monitor", acknowledged: true, createdAt: "2026-03-06T12:45:00Z" },
  { id: "a8", severity: "low", title: "New influencer engagement detected", description: "A new influencer with 500K followers engaged positively with branded content on Instagram.", projectName: "Campaign Tracker", acknowledged: false, createdAt: "2026-03-06T10:20:00Z" },
  { id: "a9", severity: "medium", title: "Competitor mention volume increase", description: "Competitor 'AcmeCorp' mentions increased by 200% in the last hour, potentially indicating a product announcement.", projectName: "Competitor Watch", acknowledged: false, createdAt: "2026-03-05T23:50:00Z" },
  { id: "a10", severity: "high", title: "Negative sentiment on Facebook page", description: "Facebook page comments turned 65% negative in the past 30 minutes following a product price change announcement.", projectName: "Brand Monitor", acknowledged: true, createdAt: "2026-03-05T20:15:00Z" },
  { id: "a11", severity: "low", title: "Mention volume normalizing", description: "After the earlier spike, mention volume has returned to normal levels across all tracked platforms.", projectName: "Brand Monitor", acknowledged: true, createdAt: "2026-03-05T17:00:00Z" },
  { id: "a12", severity: "medium", title: "Hashtag #KhushFus trending", description: "The branded hashtag is trending in the US region with over 1,200 uses in the past hour.", projectName: "Campaign Tracker", acknowledged: false, createdAt: "2026-03-05T14:30:00Z" },
  { id: "a13", severity: "high", title: "Webhook delivery failure", description: "Alert webhook to https://hooks.example.com/crisis failed 3 consecutive times. Last error: connection timeout.", projectName: "Brand Monitor", acknowledged: false, createdAt: "2026-03-05T11:00:00Z" },
  { id: "a14", severity: "low", title: "Daily summary threshold met", description: "Daily mention count has reached the configured threshold of 500 mentions for the Product Launch project.", projectName: "Product Launch", acknowledged: true, createdAt: "2026-03-04T23:59:00Z" },
  { id: "a15", severity: "critical", title: "Multi-platform negative cascade", description: "Coordinated negative mentions detected across Twitter, Reddit, and news sites. Possible viral negative event in progress.", projectName: "Brand Monitor", acknowledged: false, createdAt: "2026-03-04T19:00:00Z" },
];

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>(mockRules);
  const [alertLog, setAlertLog] = useState<AlertLogEntry[]>(mockAlertLog);
  const [activeTab, setActiveTab] = useState("rules");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<AlertRuleType>("volume_spike");
  const [formThreshold, setFormThreshold] = useState("");
  const [formWindow, setFormWindow] = useState("");
  const [formChannels, setFormChannels] = useState<Channel[]>([]);
  const [formWebhookUrl, setFormWebhookUrl] = useState("");

  // Log filters
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterAcknowledged, setFilterAcknowledged] = useState<string>("all");

  const openCreateDialog = () => {
    setEditingRule(null);
    setFormName("");
    setFormType("volume_spike");
    setFormThreshold("");
    setFormWindow("");
    setFormChannels([]);
    setFormWebhookUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType(rule.type);
    setFormThreshold(String(rule.threshold));
    setFormWindow(String(rule.windowMinutes));
    setFormChannels(rule.channels);
    setFormWebhookUrl(rule.webhookUrl || "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    const ruleData: AlertRule = {
      id: editingRule?.id || String(Date.now()),
      name: formName,
      type: formType,
      threshold: Number(formThreshold),
      windowMinutes: Number(formWindow),
      channels: formChannels,
      webhookUrl: formChannels.includes("webhook") ? formWebhookUrl : undefined,
      active: editingRule?.active ?? true,
    };

    if (editingRule) {
      setRules((prev) => prev.map((r) => (r.id === editingRule.id ? ruleData : r)));
    } else {
      setRules((prev) => [...prev, ruleData]);
    }
    setDialogOpen(false);
  };

  const toggleRuleActive = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r))
    );
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleAcknowledged = (id: string) => {
    setAlertLog((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: !a.acknowledged } : a))
    );
  };

  const toggleChannel = (ch: Channel) => {
    setFormChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const filteredLog = alertLog.filter((entry) => {
    if (filterSeverity !== "all" && entry.severity !== filterSeverity) return false;
    if (filterAcknowledged === "yes" && !entry.acknowledged) return false;
    if (filterAcknowledged === "no" && entry.acknowledged) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground mt-1">
          Configure alert rules and review alert history.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
          <TabsTrigger value="log">Alert Log</TabsTrigger>
        </TabsList>

        {/* Tab 1: Alert Rules */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Alert Rules</CardTitle>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Alert Rule
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge className={cn(ruleTypeBadgeStyles[rule.type])}>
                            {ruleTypeLabels[rule.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>{rule.threshold}</TableCell>
                        <TableCell>{rule.windowMinutes}m</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {rule.channels.map((ch) => {
                              const Icon = channelIcons[ch];
                              return (
                                <div
                                  key={ch}
                                  className="rounded-md bg-muted p-1.5"
                                  title={ch}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleRuleActive(rule.id)}
                            className={cn(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                              rule.active ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                rule.active ? "translate-x-6" : "translate-x-1"
                              )}
                            />
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(rule)}
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRule(rule.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Alert Log */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle>Alert History</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="w-40">
                  <Select
                    value={filterSeverity}
                    onValueChange={setFilterSeverity}
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                </div>
                <div className="w-44">
                  <Select
                    value={filterAcknowledged}
                    onValueChange={setFilterAcknowledged}
                  >
                    <option value="all">All Status</option>
                    <option value="yes">Acknowledged</option>
                    <option value="no">Unacknowledged</option>
                  </Select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Description</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Acknowledged</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge className={cn("capitalize", severityStyles[entry.severity])}>
                            {entry.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px]">
                          {entry.title}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[300px] truncate">
                          {entry.description}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {entry.projectName}
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={entry.acknowledged}
                            onChange={() => toggleAcknowledged(entry.id)}
                            className="h-4 w-4 accent-primary rounded"
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredLog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No alerts match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      {dialogOpen && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingRule ? "Edit Alert Rule" : "Create Alert Rule"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Name</label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Alert rule name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Rule Type</label>
                  <Select
                    value={formType}
                    onValueChange={(v: string) => setFormType(v as AlertRuleType)}
                  >
                    <option value="volume_spike">Volume Spike</option>
                    <option value="negative_surge">Negative Surge</option>
                    <option value="influencer">Influencer</option>
                    <option value="keyword_surge">Keyword Surge</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Threshold</label>
                    <Input
                      type="number"
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Window (minutes)</label>
                    <Input
                      type="number"
                      value={formWindow}
                      onChange={(e) => setFormWindow(e.target.value)}
                      placeholder="30"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Channels</label>
                  <div className="flex gap-4">
                    {(["email", "slack", "webhook"] as Channel[]).map((ch) => (
                      <label key={ch} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formChannels.includes(ch)}
                          onChange={() => toggleChannel(ch)}
                          className="h-4 w-4 accent-primary rounded"
                        />
                        <span className="text-sm capitalize">{ch}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {formChannels.includes("webhook") && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Webhook URL</label>
                    <Input
                      value={formWebhookUrl}
                      onChange={(e) => setFormWebhookUrl(e.target.value)}
                      placeholder="https://hooks.example.com/alert"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!formName || !formThreshold || !formWindow}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
