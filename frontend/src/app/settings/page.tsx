"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Plus,
  Loader2,
  UserCircle,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  Building2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn, formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgData {
  id?: number;
  name?: string;
  slug?: string;
  description?: string;
}

interface Member {
  id: number | string;
  email?: string;
  full_name?: string;
  name?: string;
  role?: string;
  joined_at?: string;
  created_at?: string;
}

interface ApiKeyData {
  id: number | string;
  name?: string;
  key_prefix?: string;
  prefix?: string;
  key?: string;
  scopes?: string[];
  is_active?: boolean;
  active?: boolean;
  created_at?: string;
  last_used_at?: string;
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user } = useAuth();
  const canManageTeam = user ? hasPermission(user.role, "settings.team") : false;
  const canManageKeys = user ? hasPermission(user.role, "settings.apikeys") : false;

  const [activeTab, setActiveTab] = useState("general");

  // General tab state
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgNotFound, setOrgNotFound] = useState(false);

  // Team tab state
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load org, members, and API keys in parallel
  useEffect(() => {
    (async () => {
      const [orgResult, membersResult, keysResult] = await Promise.allSettled([
        api.getOrg(),
        api.getMembers(),
        api.getApiKeys(),
      ]);

      // Org
      if (orgResult.status === "fulfilled") {
        const data = orgResult.value;
        setOrgName(data?.name || "");
        setOrgDescription(data?.description || "");
        setOrgNotFound(false);
      } else {
        const err = orgResult.reason;
        if (err?.status === 404) {
          setOrgNotFound(true);
        }
        console.error("Failed to load org:", err);
      }
      setOrgLoading(false);

      // Members
      if (membersResult.status === "fulfilled") {
        setMembers(membersResult.value ?? []);
      } else {
        setMembers([]);
      }
      setMembersLoading(false);

      // API Keys
      if (keysResult.status === "fulfilled") {
        setApiKeys(keysResult.value ?? []);
      } else {
        setApiKeys([]);
      }
      setKeysLoading(false);
    })();
  }, []);

  // Handlers
  const handleSaveOrg = async () => {
    setOrgSaving(true);
    try {
      await api.updateOrg({ name: orgName, description: orgDescription });
      toast.success("Organization settings saved");
    } catch (err: any) {
      console.error("Failed to save org:", err);
      toast.error("Failed to save settings");
    } finally {
      setOrgSaving(false);
    }
  };

  const handleInvite = async () => {
    setInviting(true);
    try {
      await api.inviteMember(inviteEmail, inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
      // Refresh members
      const data = await api.getMembers();
      setMembers(data ?? []);
    } catch (err: any) {
      console.error("Failed to invite member:", err);
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCreateKey = async () => {
    setCreatingKey(true);
    try {
      const result = await api.createApiKey({ name: keyName });
      toast.success("API key created");
      setCreateKeyOpen(false);
      // If the API returns the key value, show it
      if (result?.key || result?.api_key || result?.token) {
        setNewKeyValue(result.key || result.api_key || result.token || "");
        setShowKeyDialog(true);
      }
      setKeyName("");
      // Refresh keys
      const data = await api.getApiKeys();
      setApiKeys(data ?? []);
    } catch (err: any) {
      console.error("Failed to create API key:", err);
      toast.error("Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const roleBadge = (role: string) => {
    switch (role?.toLowerCase()) {
      case "owner":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "admin":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "manager":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default:
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    }
  };

  return (
    <AppShell title="Settings">
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-white/[0.08]">
            <TabsTrigger value="general">General</TabsTrigger>
            {canManageTeam && <TabsTrigger value="team">Team</TabsTrigger>}
            {canManageKeys && <TabsTrigger value="apikeys">API Keys</TabsTrigger>}
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* General Tab                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {orgLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : orgNotFound ? (
                  <div className="text-center py-8">
                    <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-500">No organization found</p>
                    <p className="text-xs text-slate-600 mt-1">
                      An organization will be created when you set up your account.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-1 block">
                        Organization Name
                      </label>
                      <Input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-1 block">
                        Description
                      </label>
                      <Input
                        value={orgDescription}
                        onChange={(e) => setOrgDescription(e.target.value)}
                        placeholder="Brief description of your organization"
                        className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleSaveOrg}
                        disabled={orgSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {orgSaving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Team Tab                                                          */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="team">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Users className="h-5 w-5 text-slate-400" />
                  Team Members
                </CardTitle>
                <Button
                  onClick={() => setInviteOpen(true)}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-500">No team members yet</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Invite colleagues to collaborate on your projects.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                        <TableRow className="hover:bg-transparent border-white/[0.08]">
                          <TableHead className="text-slate-400">User</TableHead>
                          <TableHead className="text-slate-400">Role</TableHead>
                          <TableHead className="text-slate-400">Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-white/[0.06]">
                        {members.map((m) => (
                          <TableRow key={m.id} className="border-white/[0.06] hover:bg-white/[0.04]">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                                  <UserCircle className="h-5 w-5 text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-200">
                                    {m.full_name || m.name || m.email || "Unknown"}
                                  </p>
                                  {m.email && (
                                    <p className="text-xs text-slate-500">{m.email}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("capitalize border", roleBadge(m.role || ""))}>
                                {m.role || "member"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-400 whitespace-nowrap">
                              {(m.joined_at || m.created_at)
                                ? formatDate(m.joined_at || m.created_at || "")
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

          {/* ---------------------------------------------------------------- */}
          {/* API Keys Tab                                                      */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="apikeys">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Key className="h-5 w-5 text-slate-400" />
                  API Keys
                </CardTitle>
                <Button
                  onClick={() => setCreateKeyOpen(true)}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Key
                </Button>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Key className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-slate-500">No API keys created</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Create an API key for programmatic access to KhushFus.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-white/[0.04] border-white/[0.08]">
                        <TableRow className="hover:bg-transparent border-white/[0.08]">
                          <TableHead className="text-slate-400">Name</TableHead>
                          <TableHead className="text-slate-400">Key</TableHead>
                          <TableHead className="text-slate-400">Status</TableHead>
                          <TableHead className="text-slate-400">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-white/[0.06]">
                        {apiKeys.map((k) => {
                          // 6.19 — Mask API keys: show only first 8 chars of the prefix
                          const prefix = k.key_prefix || k.prefix || "";
                          const masked = prefix.length > 8
                            ? prefix.slice(0, 8) + "..."
                            : prefix
                              ? prefix + "..."
                              : "********...";
                          return (
                            <TableRow key={k.id} className="border-white/[0.06] hover:bg-white/[0.04]">
                              <TableCell className="text-slate-200 font-medium">
                                {k.name || "Unnamed Key"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <code className="text-sm bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded">
                                    {masked}
                                  </code>
                                  {prefix && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(prefix);
                                          toast.success("Key prefix copied");
                                        } catch {
                                          toast.error("Failed to copy");
                                        }
                                      }}
                                      className="p-1 rounded hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors"
                                      title="Copy key prefix"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={cn(
                                  "border",
                                  (k.is_active ?? k.active ?? true)
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                )}>
                                  {(k.is_active ?? k.active ?? true) ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-slate-400 whitespace-nowrap">
                                {k.created_at ? formatDate(k.created_at) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} className="bg-white/[0.03] border border-white/[0.08]">
        <DialogHeader onClose={() => setInviteOpen(false)} className="border-white/[0.08]">
          <span className="text-slate-100">Invite Team Member</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Email</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Role</label>
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v)}
              className="bg-white/[0.06] border-white/[0.08] text-slate-100"
            >
              <option value="viewer">Viewer</option>
              <option value="analyst">Analyst</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-white/[0.03]">
          <Button
            variant="outline"
            onClick={() => setInviteOpen(false)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Invite
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Create API Key Dialog */}
      <Dialog open={createKeyOpen} onClose={() => setCreateKeyOpen(false)} className="bg-white/[0.03] border border-white/[0.08]">
        <DialogHeader onClose={() => setCreateKeyOpen(false)} className="border-white/[0.08]">
          <span className="text-slate-100">Create API Key</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">Key Name</label>
            <Input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Production API Key"
              className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-white/[0.03]">
          <Button
            variant="outline"
            onClick={() => setCreateKeyOpen(false)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateKey}
            disabled={creatingKey || !keyName}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {creatingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Key Created - Show Value Dialog */}
      <Dialog open={showKeyDialog} onClose={() => setShowKeyDialog(false)} className="bg-white/[0.03] border border-white/[0.08]">
        <DialogHeader onClose={() => setShowKeyDialog(false)} className="border-white/[0.08]">
          <span className="text-slate-100">API Key Created</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              This key will not be shown again. Copy it now and store it securely.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-white/[0.06] text-slate-300 p-3 rounded-lg break-all">
              {newKeyValue}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-white/[0.03]">
          <Button
            onClick={() => setShowKeyDialog(false)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Done
          </Button>
        </DialogFooter>
      </Dialog>
    </AppShell>
  );
}
