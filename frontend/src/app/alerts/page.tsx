"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Bell,
  Loader2,
  FolderOpen,
  Mail,
  MessageSquare,
  Webhook,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

interface Project {
  id: number;
  name: string;
}

interface AlertRule {
  id: number | string;
  name: string;
  rule_type?: string;
  type?: string;
  threshold?: number;
  window_minutes?: number;
  windowMinutes?: number;
  channels?: string[];
  webhook_url?: string;
  is_active?: boolean;
  active?: boolean;
}

interface AlertLogEntry {
  id: number | string;
  severity?: string;
  title?: string;
  message?: string;
  description?: string;
  acknowledged?: boolean;
  triggered_at?: string;
  created_at?: string;
}

const ruleTypeLabels: Record<string, string> = {
  volume_spike: "Volume Spike",
  negative_surge: "Negative Surge",
  influencer: "Influencer",
  keyword_surge: "Keyword Surge",
};

const ruleTypeBadge: Record<string, string> = {
  volume_spike: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  negative_surge: "bg-red-500/10 text-red-400 border-red-500/20",
  influencer: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  keyword_surge: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const severityColor: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

type Channel = "email" | "slack" | "webhook";

const channelIcons: Record<Channel, typeof Mail> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
};

export default function AlertsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("rules");

  // Rules state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  // Log state
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("volume_spike");
  const [formThreshold, setFormThreshold] = useState("");
  const [formWindow, setFormWindow] = useState("");
  const [formChannels, setFormChannels] = useState<Channel[]>([]);
  const [formWebhookUrl, setFormWebhookUrl] = useState("");

  // Load projects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getProjects();
        if (cancelled) return;
        setProjects(list ?? []);
        if (list?.length > 0) setSelectedProjectId(list[0].id);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load rules
  const fetchRules = useCallback(async (projectId: number) => {
    setRulesLoading(true);
    try {
      const data = await api.getAlertRules(projectId);
      setRules(data ?? []);
    } catch {
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  // Load logs
  const fetchLogs = useCallback(async (projectId: number) => {
    setLogsLoading(true);
    try {
      const data = await api.getAlertLogs(projectId);
      setLogs(data ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchRules(selectedProjectId);
      fetchLogs(selectedProjectId);
    }
  }, [selectedProjectId, fetchRules, fetchLogs]);

  const openCreateDialog = () => {
    setFormName("");
    setFormType("volume_spike");
    setFormThreshold("");
    setFormWindow("");
    setFormChannels([]);
    setFormWebhookUrl("");
    setDialogOpen(true);
  };

  const toggleChannel = (ch: Channel) => {
    setFormChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleCreate = async () => {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      await api.createAlertRule(selectedProjectId, {
        name: formName,
        rule_type: formType,
        threshold: Number(formThreshold),
        window_minutes: Number(formWindow),
        channels: formChannels,
        webhook_url: formChannels.includes("webhook") ? formWebhookUrl : undefined,
      });
      toast.success("Alert rule created");
      setDialogOpen(false);
      fetchRules(selectedProjectId);
    } catch (err: any) {
      console.error("Failed to create alert rule:", err);
      toast.error("Failed to create alert rule");
    } finally {
      setSaving(false);
    }
  };

  const getRuleType = (r: AlertRule) => r.rule_type || r.type || "unknown";
  const getRuleWindow = (r: AlertRule) => r.window_minutes ?? r.windowMinutes ?? 0;

  return (
    <AppShell title="Alerts">
      <div className="space-y-6">
        {/* Project selector */}
        <div className="w-64">
          {projectsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
            </div>
          ) : projects.length > 0 ? (
            <Select
              value={String(selectedProjectId ?? "")}
              onValueChange={(v) => setSelectedProjectId(Number(v))}
              className="bg-slate-900 border-slate-700 text-slate-100"
            >
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-slate-500">No projects found</p>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-slate-700">
            <TabsTrigger value="rules" className="data-[state=active]:text-indigo-400">
              Alert Rules
            </TabsTrigger>
            <TabsTrigger value="log" className="data-[state=active]:text-indigo-400">
              Alert Log
            </TabsTrigger>
          </TabsList>

          {/* Rules Tab */}
          <TabsContent value="rules">
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-slate-100">Alert Rules</CardTitle>
                <Button
                  onClick={openCreateDialog}
                  size="sm"
                  disabled={!selectedProjectId}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Rule
                </Button>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : rules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bell className="mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-500">No alert rules configured</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Create a rule to get notified when important events occur.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-800/50 border-slate-700">
                        <TableRow className="hover:bg-transparent border-slate-700">
                          <TableHead className="text-slate-400">Name</TableHead>
                          <TableHead className="text-slate-400">Type</TableHead>
                          <TableHead className="text-slate-400">Threshold</TableHead>
                          <TableHead className="text-slate-400">Window</TableHead>
                          <TableHead className="text-slate-400">Channels</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-slate-800">
                        {rules.map((rule) => (
                          <TableRow key={rule.id} className="border-slate-800 hover:bg-slate-800/40">
                            <TableCell className="text-slate-200 font-medium">{rule.name}</TableCell>
                            <TableCell>
                              <Badge className={cn("capitalize border", ruleTypeBadge[getRuleType(rule)] || "bg-slate-500/10 text-slate-400 border-slate-500/20")}>
                                {ruleTypeLabels[getRuleType(rule)] || getRuleType(rule)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-300">{rule.threshold ?? "-"}</TableCell>
                            <TableCell className="text-slate-300">{getRuleWindow(rule)}m</TableCell>
                            <TableCell>
                              <div className="flex gap-1.5">
                                {(rule.channels || []).map((ch) => {
                                  const Icon = channelIcons[ch as Channel];
                                  return Icon ? (
                                    <div key={ch} className="rounded-md bg-slate-800 p-1.5" title={ch}>
                                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                  ) : (
                                    <span key={ch} className="text-xs text-slate-500">{ch}</span>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Log Tab */}
          <TabsContent value="log">
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="border-slate-800">
                <CardTitle className="text-slate-100">Alert History</CardTitle>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FolderOpen className="mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-500">No alerts triggered yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-800/50 border-slate-700">
                        <TableRow className="hover:bg-transparent border-slate-700">
                          <TableHead className="text-slate-400">Severity</TableHead>
                          <TableHead className="text-slate-400">Message</TableHead>
                          <TableHead className="text-slate-400">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-slate-800">
                        {logs.map((entry) => (
                          <TableRow key={entry.id} className="border-slate-800 hover:bg-slate-800/40">
                            <TableCell>
                              <Badge className={cn("capitalize border", severityColor[entry.severity || "low"] || severityColor.low)}>
                                {entry.severity || "info"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-200 max-w-[400px] truncate">
                              {entry.title || entry.message || entry.description || "-"}
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm whitespace-nowrap">
                              {(entry.triggered_at || entry.created_at)
                                ? formatDate(entry.triggered_at || entry.created_at || "")
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="bg-slate-900 border border-slate-700">
        <DialogHeader onClose={() => setDialogOpen(false)} className="border-slate-700">
          <span className="text-slate-100">Create Alert Rule</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Name</label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Alert rule name"
              className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Rule Type</label>
            <Select
              value={formType}
              onValueChange={(v) => setFormType(v)}
              className="bg-slate-800 border-slate-700 text-slate-100"
            >
              <option value="volume_spike">Volume Spike</option>
              <option value="negative_surge">Negative Surge</option>
              <option value="influencer">Influencer</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Threshold</label>
              <Input
                type="number"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                placeholder="100"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Window (min)</label>
              <Input
                type="number"
                value={formWindow}
                onChange={(e) => setFormWindow(e.target.value)}
                placeholder="30"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Channels</label>
            <div className="flex gap-4">
              {(["email", "slack", "webhook"] as Channel[]).map((ch) => (
                <label key={ch} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formChannels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    className="h-4 w-4 accent-indigo-500 rounded"
                  />
                  <span className="text-sm text-slate-300 capitalize">{ch}</span>
                </label>
              ))}
            </div>
          </div>
          {formChannels.includes("webhook") && (
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">Webhook URL</label>
              <Input
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/alert"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          )}
        </DialogContent>
        <DialogFooter className="border-slate-700 bg-slate-900/50">
          <Button
            variant="outline"
            onClick={() => setDialogOpen(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !formName || !formThreshold || !formWindow}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}
