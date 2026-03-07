"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users, Key, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Team Members", href: "/settings/members", icon: Users },
  { label: "API Keys", href: "/settings/api-keys", icon: Key },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar Nav */}
      <nav className="w-full md:w-56 shrink-0">
        <div className="sticky top-4 space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">
            Settings
          </h2>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
