"use client";

import { useState } from "react";
import { Plus, Copy, Check, AlertTriangle } from "lucide-react";
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

type Scope = "read" | "write" | "admin";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  rateLimit: number;
  lastUsed: string | null;
  active: boolean;
  createdAt: string;
}

const scopeBadgeStyles: Record<Scope, string> = {
  read: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  write: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const mockKeys: ApiKey[] = [
  { id: "1", name: "Production API", prefix: "kf_prod_a3f8", scopes: ["read", "write"], rateLimit: 1000, lastUsed: "2026-03-07T06:30:00Z", active: true, createdAt: "2025-06-01T00:00:00Z" },
  { id: "2", name: "Analytics Dashboard", prefix: "kf_dash_b7c2", scopes: ["read"], rateLimit: 500, lastUsed: "2026-03-06T22:15:00Z", active: true, createdAt: "2025-09-15T00:00:00Z" },
  { id: "3", name: "Admin CLI Tool", prefix: "kf_adm_d9e1", scopes: ["read", "write", "admin"], rateLimit: 2000, lastUsed: "2026-03-05T14:00:00Z", active: true, createdAt: "2025-11-20T00:00:00Z" },
  { id: "4", name: "Legacy Integration", prefix: "kf_leg_f4a6", scopes: ["read"], rateLimit: 100, lastUsed: "2026-01-10T08:00:00Z", active: false, createdAt: "2025-02-01T00:00:00Z" },
];

function generateFakeKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "kf_";
  for (let i = 0; i < 48; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>(mockKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScopes, setFormScopes] = useState<Scope[]>([]);
  const [formRateLimit, setFormRateLimit] = useState("1000");

  const toggleScope = (s: Scope) => {
    setFormScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleCreate = () => {
    const fullKey = generateFakeKey();
    const prefix = fullKey.slice(0, 12);
    const newKey: ApiKey = {
      id: String(Date.now()),
      name: formName,
      prefix: prefix,
      scopes: formScopes,
      rateLimit: Number(formRateLimit),
      lastUsed: null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setKeys((prev) => [newKey, ...prev]);
    setNewKeyValue(fullKey);
    setCreateOpen(false);
    setShowKeyDialog(true);
    setFormName("");
    setFormScopes([]);
    setFormRateLimit("1000");
  };

  const handleRevoke = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setRevokeId(null);
  };

  const toggleActive = (id: string) => {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, active: !k.active } : k))
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage API keys for programmatic access.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* Keys Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                        {key.prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {key.scopes.map((s) => (
                          <Badge key={s} className={cn("text-xs", scopeBadgeStyles[s])}>
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {key.rateLimit.toLocaleString()}/hr
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {key.lastUsed ? formatDate(key.lastUsed) : "Never"}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleActive(key.id)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          key.active ? "bg-primary" : "bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            key.active ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokeId(key.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {createOpen && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">Create API Key</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Name</label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My API Key"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Scopes</label>
                  <div className="flex gap-4">
                    {(["read", "write", "admin"] as Scope[]).map((s) => (
                      <label key={s} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formScopes.includes(s)}
                          onChange={() => toggleScope(s)}
                          className="h-4 w-4 accent-primary rounded"
                        />
                        <span className="text-sm capitalize">{s}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Rate Limit (requests/hour)
                  </label>
                  <Input
                    type="number"
                    value={formRateLimit}
                    onChange={(e) => setFormRateLimit(e.target.value)}
                    placeholder="1000"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formName || formScopes.length === 0}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Key Created Success Dialog */}
      {showKeyDialog && (
        <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-2">API Key Created</h2>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  This key won&apos;t be shown again. Please copy it now and
                  store it securely.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted p-3 rounded-lg break-all">
                  {newKeyValue}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex justify-end mt-6">
                <Button onClick={() => setShowKeyDialog(false)}>Done</Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Revoke Confirmation Dialog */}
      {revokeId && (
        <Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm mx-4 p-6">
              <h2 className="text-lg font-semibold mb-2">Revoke API Key</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to revoke this API key? Any applications
                using this key will immediately lose access. This action cannot
                be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRevokeId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleRevoke(revokeId)}
                >
                  Revoke Key
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
