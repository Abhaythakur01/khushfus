"use client";

import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

interface RbacGuardProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component-level RBAC guard. Renders children only if the current user
 * has the required permission; otherwise renders the fallback (default: nothing).
 */
export function RbacGuard({ permission, children, fallback = null }: RbacGuardProps) {
  const { user } = useAuth();
  if (!user || !hasPermission(user.role, permission)) return <>{fallback}</>;
  return <>{children}</>;
}
