// Single source of truth mapping admin routes → the permission required to
// visit them. Consumed by <PermissionRoute />, <AdminSidebar />, and
// useAdminNav.
//
// Keep in sync with the permission catalogue in
// `src/services/permission-catalog.ts`, the DB seed for `role_permissions`,
// and the `requirePermission` gate in `supabase/functions/_shared/auth.ts`.

export interface AdminRoutePermission {
  /** Path or path prefix (e.g. "/admin/users" matches "/admin/users/123"). */
  path: string;
  /** Permission key that unlocks this route (module.action). */
  permission: string;
}

/**
 * Ordered longest-first so nested routes match before their parent when we
 * scan for a permission.
 */
export const ADMIN_ROUTE_PERMISSIONS: AdminRoutePermission[] = [
  { path: "/admin/access-approvals",        permission: "users_and_access.manage_permissions" },
  { path: "/admin/access-control",          permission: "users_and_access.manage_permissions" },
  { path: "/admin/users-access",            permission: "users_and_access.manage_permissions" },
  { path: "/admin/permission-matrix",       permission: "permissions.view" },
  { path: "/admin/permissions",             permission: "permissions.view" },
  { path: "/admin/agent-performance",       permission: "agent_performance.view" },
  { path: "/admin/task-orchestration",      permission: "task_orchestration.view" },
  { path: "/admin/audit-logs",              permission: "audit_logs.view" },
  { path: "/admin/settings",                permission: "platform_configuration.configure" },
  { path: "/admin/notifications",           permission: "platform_configuration.view" },
  { path: "/admin/reconciliation",          permission: "financial_controls.view" },
  { path: "/admin/escrow",                  permission: "escrow.view" },
  { path: "/admin/payouts",                 permission: "financial_controls.view" },
  { path: "/admin/flagged-users/export",    permission: "flagged_users.export" },
  { path: "/admin/flagged-users",           permission: "flagged_users.view" },
  { path: "/admin/users",                   permission: "users_and_access.view" },
  { path: "/admin/offers",                  permission: "transactions.view" },
  { path: "/admin/disputes/export",         permission: "disputes.export" },
  { path: "/admin/disputes",                permission: "disputes.view" },
  { path: "/admin/transactions/export",     permission: "transactions.export" },
  { path: "/admin/transactions",            permission: "transactions.view" },
  { path: "/admin/dashboard",               permission: "dashboard.view" },
];

/**
 * Return the permission required by a given admin pathname, or `null` when
 * the route is not gated (e.g. non-admin routes, or an unlisted admin path
 * we should treat as open — should not happen if the map is complete).
 */
export function permissionForPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  // Normalise trailing slash.
  const p = pathname.replace(/\/+$/g, "") || "/";
  // Leaf-first: pick the LONGEST matching entry so nested action routes
  // (e.g. /admin/transactions/export) take precedence over parent view perms.
  let best: AdminRoutePermission | null = null;
  for (const entry of ADMIN_ROUTE_PERMISSIONS) {
    if (p === entry.path || p.startsWith(entry.path + "/")) {
      if (!best || entry.path.length > best.path.length) best = entry;
    }
  }
  return best?.permission ?? null;
}
