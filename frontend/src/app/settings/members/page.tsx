"use client";

import { useState } from "react";
import { Plus, Trash2, UserCircle } from "lucide-react";
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

type Role = "Owner" | "Admin" | "Manager" | "Analyst" | "Viewer";

interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: Role;
  joinedAt: string;
  lastActive: string;
}

const roleBadgeStyles: Record<Role, string> = {
  Owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  Admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Manager: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  Analyst: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Viewer: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const mockMembers: Member[] = [
  { id: "1", name: "Khush Patel", email: "khush@khushfus.io", role: "Owner", joinedAt: "2025-01-15T00:00:00Z", lastActive: "2026-03-07T08:00:00Z" },
  { id: "2", name: "Sarah Chen", email: "sarah.chen@khushfus.io", role: "Admin", joinedAt: "2025-03-10T00:00:00Z", lastActive: "2026-03-07T07:45:00Z" },
  { id: "3", name: "Marcus Johnson", email: "marcus.j@khushfus.io", role: "Manager", joinedAt: "2025-06-22T00:00:00Z", lastActive: "2026-03-06T16:30:00Z" },
  { id: "4", name: "Emily Rodriguez", email: "emily.r@khushfus.io", role: "Analyst", joinedAt: "2025-08-01T00:00:00Z", lastActive: "2026-03-07T06:15:00Z" },
  { id: "5", name: "Alex Kim", email: "alex.kim@khushfus.io", role: "Analyst", joinedAt: "2025-10-15T00:00:00Z", lastActive: "2026-03-05T14:00:00Z" },
  { id: "6", name: "Jordan Taylor", email: "jordan.t@khushfus.io", role: "Viewer", joinedAt: "2026-01-08T00:00:00Z", lastActive: "2026-03-04T09:30:00Z" },
];

const roles: Role[] = ["Owner", "Admin", "Manager", "Analyst", "Viewer"];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>(mockMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Viewer");

  const handleInvite = () => {
    const newMember: Member = {
      id: String(Date.now()),
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
    setMembers((prev) => [...prev, newMember]);
    setInviteEmail("");
    setInviteRole("Viewer");
    setInviteOpen(false);
  };

  const handleChangeRole = (id: string, role: Role) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role } : m))
    );
  };

  const handleRemove = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage who has access to your organization.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* Members Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                          <UserCircle className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(roleBadgeStyles[member.role])}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(member.lastActive)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(v: string) =>
                            handleChangeRole(member.id, v as Role)
                          }
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(member.id)}
                          disabled={member.role === "Owner"}
                          title="Remove member"
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

      {/* Invite Dialog */}
      {inviteOpen && (
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-semibold mb-4">Invite Member</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Email</label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Role</label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v: string) => setInviteRole(v as Role)}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={!inviteEmail}>
                  Send Invite
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <Dialog
          open={!!confirmDeleteId}
          onOpenChange={() => setConfirmDeleteId(null)}
        >
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm mx-4 p-6">
              <h2 className="text-lg font-semibold mb-2">Remove Member</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to remove this member from the
                organization? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleRemove(confirmDeleteId)}
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
