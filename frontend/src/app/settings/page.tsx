"use client";

import { useState } from "react";
import { Save, ArrowUpCircle } from "lucide-react";
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

interface OrgSettings {
  name: string;
  slug: string;
  logoUrl: string;
  brandColor: string;
  plan: string;
  mentionsUsed: number;
  mentionsQuota: number;
  maxProjects: number;
  maxUsers: number;
}

const initialSettings: OrgSettings = {
  name: "KhushFus Inc.",
  slug: "khushfus",
  logoUrl: "https://khushfus.io/logo.png",
  brandColor: "#6366f1",
  plan: "Professional",
  mentionsUsed: 34520,
  mentionsQuota: 50000,
  maxProjects: 10,
  maxUsers: 25,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const usagePercent = Math.round(
    (settings.mentionsUsed / settings.mentionsQuota) * 100
  );

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
  };

  const update = (field: keyof OrgSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization settings and subscription.
        </p>
      </div>

      {/* Organization Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Organization Name
            </label>
            <Input
              value={settings.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Organization Slug
            </label>
            <Input value={settings.slug} readOnly className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">
              This cannot be changed after creation.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Logo URL</label>
            <Input
              value={settings.logoUrl}
              onChange={(e) => update("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Primary Brand Color
            </label>
            <div className="flex items-center gap-3">
              <Input
                value={settings.brandColor}
                onChange={(e) => update("brandColor", e.target.value)}
                placeholder="#6366f1"
                className="max-w-[200px]"
              />
              <div
                className="h-10 w-10 rounded-lg border shadow-sm"
                style={{ backgroundColor: settings.brandColor }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Info */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Current Plan:</span>
            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
              {settings.plan}
            </Badge>
          </div>

          {/* Usage */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">Mentions Used</span>
              <span className="text-sm text-muted-foreground">
                {settings.mentionsUsed.toLocaleString()} /{" "}
                {settings.mentionsQuota.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usagePercent > 90
                    ? "bg-red-500"
                    : usagePercent > 70
                    ? "bg-yellow-500"
                    : "bg-primary"
                )}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usagePercent}% of monthly quota used
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Max Projects</p>
              <p className="text-2xl font-bold">{settings.maxProjects}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Max Users</p>
              <p className="text-2xl font-bold">{settings.maxUsers}</p>
            </div>
          </div>

          <Button variant="outline">
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            Upgrade Plan
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </span>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
