/**
 * Role-Based Access Control (RBAC) for the KhushFus frontend.
 *
 * Defines a hierarchical role system and permission checks used by:
 * - AuthProvider (route-level enforcement)
 * - RbacGuard component (component-level enforcement)
 * - Sidebar (nav item visibility)
 * - Settings page (tab visibility)
 */

// ---------------------------------------------------------------------------
// Role hierarchy (highest to lowest privilege)
// ---------------------------------------------------------------------------

export const ROLE_HIERARCHY = ["owner", "admin", "manager", "analyst", "viewer"] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

// ---------------------------------------------------------------------------
// Permission map
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: [
    "dashboard",
    "dashboards",
    "dashboards.manage",
    "mentions",
    "projects",
    "projects.manage",
    "analytics",
    "competitive",
    "search",
    "reports",
    "reports.generate",
    "alerts",
    "alerts.manage",
    "crisis",
    "publishing",
    "publishing.manage",
    "workflows",
    "workflows.manage",
    "settings",
    "settings.team",
    "settings.apikeys",
    "settings.sso",
    "audit",
    "compliance",
    "integrations",
  ],
  manager: [
    "dashboard",
    "dashboards",
    "dashboards.manage",
    "mentions",
    "projects",
    "projects.manage",
    "analytics",
    "competitive",
    "search",
    "reports",
    "reports.generate",
    "alerts",
    "alerts.manage",
    "crisis",
    "publishing",
    "publishing.manage",
    "workflows",
    "workflows.manage",
  ],
  analyst: [
    "dashboard",
    "dashboards",
    "dashboards.manage",
    "mentions",
    "projects",
    "analytics",
    "competitive",
    "search",
    "reports",
    "crisis",
  ],
  viewer: ["dashboard", "dashboards", "mentions", "projects"],
};

// ---------------------------------------------------------------------------
// Permission checking
// ---------------------------------------------------------------------------

/**
 * Check whether a role has a specific permission.
 * The `owner` role has wildcard access ("*").
 */
export function hasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role) return hasPermission("viewer", permission);
  const perms = ROLE_PERMISSIONS[role.toLowerCase()];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

// ---------------------------------------------------------------------------
// Route-to-permission mapping
// ---------------------------------------------------------------------------

interface RouteMapping {
  /** Exact path or prefix to match */
  path: string;
  /** Required permission */
  permission: string;
  /** If true, only match if the pathname equals the path exactly */
  exact?: boolean;
}

/**
 * Ordered list of route mappings. More specific routes come first so they
 * match before their parent prefixes.
 */
const ROUTE_MAPPINGS: RouteMapping[] = [
  // Projects — creating a new project requires manage permission
  { path: "/projects/new", permission: "projects.manage", exact: true },
  // Projects — viewing is base permission
  { path: "/projects", permission: "projects" },
  // Settings sub-routes are handled at component level; the route itself
  // just needs the base "settings" permission
  { path: "/settings", permission: "settings" },
  // Other routes
  { path: "/dashboard", permission: "dashboard" },
  { path: "/dashboards", permission: "dashboards" },
  { path: "/mentions", permission: "mentions" },
  { path: "/analytics", permission: "analytics" },
  { path: "/competitive", permission: "competitive" },
  { path: "/search", permission: "search" },
  { path: "/reports", permission: "reports" },
  { path: "/alerts", permission: "alerts" },
  { path: "/crisis", permission: "crisis" },
  { path: "/publishing", permission: "publishing" },
  { path: "/workflows", permission: "workflows" },
  { path: "/audit", permission: "audit" },
  { path: "/compliance", permission: "compliance" },
  { path: "/integrations", permission: "integrations" },
];

/**
 * Check whether a role can access a given route pathname.
 * Returns true for unknown routes (e.g. root "/") to avoid blocking
 * redirects or 404 pages.
 */
export function canAccessRoute(role: string | undefined | null, pathname: string): boolean {
  if (!role) role = "viewer";
  for (const mapping of ROUTE_MAPPINGS) {
    if (mapping.exact) {
      if (pathname === mapping.path) {
        return hasPermission(role, mapping.permission);
      }
    } else {
      if (pathname === mapping.path || pathname.startsWith(mapping.path + "/")) {
        return hasPermission(role, mapping.permission);
      }
    }
  }
  // Unknown route — allow access (will hit 404 or redirect naturally)
  return true;
}
