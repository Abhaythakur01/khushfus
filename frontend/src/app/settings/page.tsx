"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Info,
  Eye,
  EyeOff,
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

type SsoProvider = "saml" | "oidc";

interface SsoConfig {
  enabled: boolean;
  provider: SsoProvider;
  // SAML fields
  saml_entity_id?: string;
  saml_sso_url?: string;
  saml_certificate?: string;
  // OIDC fields
  oidc_client_id?: string;
  oidc_client_secret?: string;
  oidc_issuer_url?: string;
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const searchParams = useSearchParams();
  const canManageTeam = user ? hasPermission(user.role, "settings.team") : false;
  const canManageKeys = user ? hasPermission(user.role, "settings.apikeys") : false;
  const canManageSso = user ? hasPermission(user.role, "settings.sso") : false;

  const initialTab = searchParams?.get("tab") === "profile" ? "profile" : "general";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile tab state
  const [profileName, setProfileName] = useState(user?.full_name ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // General tab state
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
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

  // Remove member dialog state
  const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  // Role update in-progress tracking (keyed by member id)
  const [updatingRoles, setUpdatingRoles] = useState<Record<string | number, boolean>>({});

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  // Revoke API key dialog state
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<ApiKeyData | null>(null);
  const [revokingKey, setRevokingKey] = useState(false);

  // SSO tab state
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoProvider, setSsoProvider] = useState<SsoProvider>("saml");
  const [samlEntityId, setSamlEntityId] = useState("");
  const [samlSsoUrl, setSamlSsoUrl] = useState("");
  const [samlCertificate, setSamlCertificate] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState("");
  const [ssoSaving, setSsoSaving] = useState(false);

  // Derive the OIDC redirect URI from current origin
  const oidcRedirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth/sso/callback`
      : "https://your-domain.com/api/auth/sso/callback";

  // Sync profile name when user loads from auth context
  useEffect(() => {
    if (user?.full_name && !profileName) {
      setProfileName(user.full_name);
    }
  }, [user?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const data = orgResult.value as OrgData & { sso_config?: SsoConfig };
        setOrgName(data?.name || "");
        setOrgDescription(data?.description || "");
        setOrgSlug(data?.slug || "");
        setOrgNotFound(false);
        // Pre-populate SSO fields if org has existing sso_config
        if (data?.sso_config) {
          const sso = data.sso_config;
          setSsoEnabled(sso.enabled ?? false);
          setSsoProvider(sso.provider ?? "saml");
          setSamlEntityId(sso.saml_entity_id ?? "");
          setSamlSsoUrl(sso.saml_sso_url ?? "");
          setSamlCertificate(sso.saml_certificate ?? "");
          setOidcClientId(sso.oidc_client_id ?? "");
          setOidcClientSecret(sso.oidc_client_secret ?? "");
          setOidcIssuerUrl(sso.oidc_issuer_url ?? "");
        }
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

  // ---------------------------------------------------------------------------
  // Handlers — Profile
  // ---------------------------------------------------------------------------

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }
    setProfileSaving(true);
    try {
      const updated = await api.updateProfile({ full_name: profileName.trim() });
      updateUser({ full_name: updated.full_name });
      toast.success("Profile updated");
    } catch (err: unknown) {
      const msg = (err as { safeMessage?: string })?.safeMessage ?? "Failed to update profile";
      toast.error(msg);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setPasswordSaving(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = (err as { safeMessage?: string })?.safeMessage ?? "Failed to change password";
      toast.error(msg);
    } finally {
      setPasswordSaving(false);
    }
  };

  const passwordStrength = (pwd: string): { label: string; color: string } => {
    if (!pwd) return { label: "", color: "" };
    if (pwd.length < 8) return { label: "Too short", color: "text-red-400" };
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const strength = [hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
    if (strength === 3) return { label: "Strong", color: "text-emerald-400" };
    if (strength === 2) return { label: "Good", color: "text-yellow-400" };
    return { label: "Weak", color: "text-orange-400" };
  };

  const pwdStrength = passwordStrength(newPassword);

  // ---------------------------------------------------------------------------
  // Handlers — General
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Handlers — Team
  // ---------------------------------------------------------------------------

  const handleInvite = async () => {
    setInviting(true);
    try {
      await api.inviteMember(inviteEmail, inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
      const data = await api.getMembers();
      setMembers(data ?? []);
    } catch (err: any) {
      console.error("Failed to invite member:", err);
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: Member, newRole: string) => {
    const memberId = member.id as number;
    setUpdatingRoles((prev) => ({ ...prev, [memberId]: true }));
    try {
      const updated = await api.updateMemberRole(memberId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m)),
      );
      toast.success(`Role updated to ${newRole}`);
    } catch (err: any) {
      console.error("Failed to update role:", err);
      toast.error("Failed to update role");
    } finally {
      setUpdatingRoles((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberTarget) return;
    const memberId = removeMemberTarget.id as number;
    setRemovingMember(true);
    try {
      await api.removeMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
      setRemoveMemberTarget(null);
    } catch (err: any) {
      console.error("Failed to remove member:", err);
      toast.error("Failed to remove member");
    } finally {
      setRemovingMember(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers — API Keys
  // ---------------------------------------------------------------------------

  const handleCreateKey = async () => {
    setCreatingKey(true);
    try {
      const result = await api.createApiKey({ name: keyName });
      toast.success("API key created");
      setCreateKeyOpen(false);
      if (result?.key || result?.api_key || result?.token) {
        setNewKeyValue(result.key || result.api_key || result.token || "");
        setShowKeyDialog(true);
      }
      setKeyName("");
      const data = await api.getApiKeys();
      setApiKeys(data ?? []);
    } catch (err: any) {
      console.error("Failed to create API key:", err);
      toast.error("Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeKeyTarget) return;
    const keyId = revokeKeyTarget.id as number;
    setRevokingKey(true);
    try {
      await api.deleteApiKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("API key revoked");
      setRevokeKeyTarget(null);
    } catch (err: any) {
      console.error("Failed to revoke API key:", err);
      toast.error("Failed to revoke API key");
    } finally {
      setRevokingKey(false);
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

  // ---------------------------------------------------------------------------
  // Handlers — SSO
  // ---------------------------------------------------------------------------

  const handleSaveSso = async () => {
    setSsoSaving(true);
    try {
      const ssoConfig: SsoConfig = {
        enabled: ssoEnabled,
        provider: ssoProvider,
        ...(ssoProvider === "saml"
          ? {
              saml_entity_id: samlEntityId,
              saml_sso_url: samlSsoUrl,
              saml_certificate: samlCertificate,
            }
          : {
              oidc_client_id: oidcClientId,
              oidc_client_secret: oidcClientSecret,
              oidc_issuer_url: oidcIssuerUrl,
            }),
      };
      await api.updateOrg({ sso_config: ssoConfig } as any);
      toast.success("SSO configuration saved");
    } catch (err: any) {
      console.error("Failed to save SSO config:", err);
      toast.error("Failed to save SSO configuration");
    } finally {
      setSsoSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  const isCurrentUser = (m: Member) =>
    user && (m.email === user.email || String(m.id) === String(user.id));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell title="Settings">
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-white/[0.08]">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            {canManageTeam && <TabsTrigger value="team">Team</TabsTrigger>}
            {canManageKeys && <TabsTrigger value="apikeys">API Keys</TabsTrigger>}
            {canManageSso && <TabsTrigger value="sso">SSO</TabsTrigger>}
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Profile Tab                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="profile" className="space-y-4">
            {/* Personal info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <UserCircle className="h-5 w-5 text-slate-400" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">
                    Display Name
                  </label>
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your full name"
                    className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">
                    Email
                  </label>
                  <Input
                    value={user?.email ?? ""}
                    readOnly
                    disabled
                    className="bg-white/[0.03] border-white/[0.06] text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-600 mt-1">Email cannot be changed here.</p>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {profileSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Profile
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Change password */}
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Key className="h-5 w-5 text-slate-400" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">
                    Current Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label={showCurrent ? "Hide password" : "Show password"}
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label={showNew ? "Hide password" : "Show password"}
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <p className={cn("text-xs mt-1", pwdStrength.color)}>
                      Strength: {pwdStrength.label}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className={cn(
                        "bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500 pr-10",
                        confirmPassword && newPassword !== confirmPassword && "border-red-500/50"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs mt-1 text-red-400">Passwords do not match</p>
                  )}
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleChangePassword}
                    disabled={
                      passwordSaving ||
                      !currentPassword ||
                      !newPassword ||
                      !confirmPassword ||
                      newPassword !== confirmPassword
                    }
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {passwordSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Change Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

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
                    {orgSlug && (
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Slug
                        </label>
                        <Input
                          value={orgSlug}
                          disabled
                          className="bg-white/[0.04] border-white/[0.06] text-slate-500 cursor-not-allowed"
                        />
                      </div>
                    )}
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
                          <TableHead className="text-slate-400 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-white/[0.06]">
                        {members.map((m) => {
                          const isSelf = isCurrentUser(m);
                          const isUpdating = updatingRoles[m.id] ?? false;
                          const currentRole = m.role || "viewer";
                          return (
                            <TableRow key={m.id} className="border-white/[0.06] hover:bg-white/[0.04]">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                                    <UserCircle className="h-5 w-5 text-slate-500" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-200">
                                      {m.full_name || m.name || m.email || "Unknown"}
                                      {isSelf && (
                                        <span className="ml-2 text-xs text-slate-500">(you)</span>
                                      )}
                                    </p>
                                    {m.email && (
                                      <p className="text-xs text-slate-500">{m.email}</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {isSelf || currentRole === "owner" ? (
                                  <Badge className={cn("capitalize border", roleBadge(currentRole))}>
                                    {currentRole}
                                  </Badge>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={currentRole}
                                      onValueChange={(v) => handleRoleChange(m, v)}
                                      disabled={isUpdating}
                                      className="w-32 text-xs py-1"
                                    >
                                      <option value="viewer">Viewer</option>
                                      <option value="analyst">Analyst</option>
                                      <option value="manager">Manager</option>
                                      <option value="admin">Admin</option>
                                    </Select>
                                    {isUpdating && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-slate-400 whitespace-nowrap">
                                {(m.joined_at || m.created_at)
                                  ? formatDate(m.joined_at || m.created_at || "")
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                {!isSelf && currentRole !== "owner" && (
                                  <button
                                    onClick={() => setRemoveMemberTarget(m)}
                                    className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Remove member"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
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
                          <TableHead className="text-slate-400 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-white/[0.06]">
                        {apiKeys.map((k) => {
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
                              <TableCell className="text-right">
                                <button
                                  onClick={() => setRevokeKeyTarget(k)}
                                  className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Revoke API key"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
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

          {/* ---------------------------------------------------------------- */}
          {/* SSO Tab                                                           */}
          {/* ---------------------------------------------------------------- */}
          {canManageSso && (
            <TabsContent value="sso">
              <Card>
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                    Single Sign-On (SSO)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* SSO Enable toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Enable SSO</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Require team members to authenticate via your identity provider.
                      </p>
                    </div>
                    <button
                      onClick={() => setSsoEnabled((v) => !v)}
                      className="text-slate-400 hover:text-indigo-400 transition-colors"
                      aria-label={ssoEnabled ? "Disable SSO" : "Enable SSO"}
                    >
                      {ssoEnabled ? (
                        <ToggleRight className="h-8 w-8 text-indigo-400" />
                      ) : (
                        <ToggleLeft className="h-8 w-8" />
                      )}
                    </button>
                  </div>

                  {/* Provider type */}
                  <div>
                    <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                      Identity Provider Protocol
                    </label>
                    <Select
                      value={ssoProvider}
                      onValueChange={(v) => setSsoProvider(v as SsoProvider)}
                      className="bg-white/[0.06] border-white/[0.08] text-slate-100 max-w-xs"
                    >
                      <option value="saml">SAML 2.0</option>
                      <option value="oidc">OpenID Connect (OIDC)</option>
                    </Select>
                  </div>

                  {/* SAML fields */}
                  {ssoProvider === "saml" && (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Entity ID (Service Provider)
                        </label>
                        <Input
                          value={samlEntityId}
                          onChange={(e) => setSamlEntityId(e.target.value)}
                          placeholder="https://your-domain.com/saml/metadata"
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          SSO URL (Identity Provider)
                        </label>
                        <Input
                          value={samlSsoUrl}
                          onChange={(e) => setSamlSsoUrl(e.target.value)}
                          placeholder="https://idp.example.com/sso/saml"
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          X.509 Certificate
                        </label>
                        <textarea
                          value={samlCertificate}
                          onChange={(e) => setSamlCertificate(e.target.value)}
                          rows={6}
                          placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                          className={cn(
                            "w-full rounded-lg border border-white/[0.08] bg-white/[0.06] p-3",
                            "text-sm text-slate-100 placeholder:text-slate-500 font-mono",
                            "resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50",
                            "transition-colors hover:border-white/[0.12]",
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* OIDC fields */}
                  {ssoProvider === "oidc" && (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Client ID
                        </label>
                        <Input
                          value={oidcClientId}
                          onChange={(e) => setOidcClientId(e.target.value)}
                          placeholder="your-client-id"
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Client Secret
                        </label>
                        <Input
                          type="password"
                          value={oidcClientSecret}
                          onChange={(e) => setOidcClientSecret(e.target.value)}
                          placeholder="your-client-secret"
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Issuer URL
                        </label>
                        <Input
                          value={oidcIssuerUrl}
                          onChange={(e) => setOidcIssuerUrl(e.target.value)}
                          placeholder="https://accounts.google.com"
                          className="bg-white/[0.06] border-white/[0.08] text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300 mb-1 block">
                          Redirect URI
                          <span className="ml-2 text-xs text-slate-500 font-normal">(read-only — add this to your IdP)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            value={oidcRedirectUri}
                            readOnly
                            className="bg-white/[0.03] border-white/[0.06] text-slate-400 cursor-default"
                          />
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(oidcRedirectUri);
                                toast.success("Redirect URI copied");
                              } catch {
                                toast.error("Failed to copy");
                              }
                            }}
                            className="p-2 rounded hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                            title="Copy redirect URI"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save button */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                    <div className="flex items-start gap-2 text-xs text-slate-500 max-w-sm">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Contact{" "}
                        <a
                          href="mailto:support@khushfus.com"
                          className="text-indigo-400 hover:underline"
                        >
                          support@khushfus.com
                        </a>{" "}
                        to complete SSO setup and enable enforcement for your organization.
                      </span>
                    </div>
                    <Button
                      onClick={handleSaveSso}
                      disabled={ssoSaving}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                    >
                      {ssoSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save SSO Config
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Invite Member Dialog                                                  */}
      {/* -------------------------------------------------------------------- */}
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

      {/* -------------------------------------------------------------------- */}
      {/* Remove Member Confirmation Dialog                                     */}
      {/* -------------------------------------------------------------------- */}
      <Dialog
        open={!!removeMemberTarget}
        onClose={() => setRemoveMemberTarget(null)}
        className="bg-white/[0.03] border border-white/[0.08]"
      >
        <DialogHeader onClose={() => setRemoveMemberTarget(null)} className="border-white/[0.08]">
          <span className="text-slate-100">Remove Team Member</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">
              Are you sure you want to remove{" "}
              <span className="font-semibold">
                {removeMemberTarget?.full_name ||
                  removeMemberTarget?.name ||
                  removeMemberTarget?.email ||
                  "this member"}
              </span>{" "}
              from your organization? They will lose access immediately.
            </p>
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-white/[0.03]">
          <Button
            variant="outline"
            onClick={() => setRemoveMemberTarget(null)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemoveMember}
            disabled={removingMember}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {removingMember && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove Member
          </Button>
        </DialogFooter>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* Create API Key Dialog                                                 */}
      {/* -------------------------------------------------------------------- */}
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

      {/* -------------------------------------------------------------------- */}
      {/* Revoke API Key Confirmation Dialog                                    */}
      {/* -------------------------------------------------------------------- */}
      <Dialog
        open={!!revokeKeyTarget}
        onClose={() => setRevokeKeyTarget(null)}
        className="bg-white/[0.03] border border-white/[0.08]"
      >
        <DialogHeader onClose={() => setRevokeKeyTarget(null)} className="border-white/[0.08]">
          <span className="text-slate-100">Revoke API Key</span>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-red-300 font-medium">This action cannot be undone.</p>
              <p className="text-sm text-red-300">
                Any applications using{" "}
                <span className="font-semibold">
                  {revokeKeyTarget?.name || "this key"}
                </span>{" "}
                will stop working immediately.
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter className="border-white/[0.08] bg-white/[0.03]">
          <Button
            variant="outline"
            onClick={() => setRevokeKeyTarget(null)}
            className="border-slate-600 text-slate-300 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRevokeKey}
            disabled={revokingKey}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {revokingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Revoke Key
          </Button>
        </DialogFooter>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* Key Created — Show Value Dialog                                       */}
      {/* -------------------------------------------------------------------- */}
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
