import { useNavigate } from "react-router";
import { toast } from "@/hooks/use-toast";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { permissionForPath } from "@/services/admin-route-permissions";

/** Routes that actually exist in the router. Everything else is "Coming soon". */
const BUILT_ROUTES = new Set<string>([
  "/admin/dashboard",
  "/admin/transactions",
  "/admin/disputes",
  "/admin/identity",
  "/admin/payouts",
  "/admin/escrow",
  "/admin/reconciliation",
  "/admin/flagged-users",
  "/admin/users",
  "/admin/notifications",
  "/admin/errors",
  "/admin/settings",
  "/admin/audit-logs",
  "/admin/access-control",
  "/admin/users-access",
  "/admin/permission-matrix",
  "/admin/permissions",
  "/admin/access-approvals",
  "/admin/task-orchestration",
  "/admin/agent-performance",
  "/admin/support",
]);

export function isBuiltAdminRoute(href: string | null | undefined): boolean {
  if (!href) return false;
  // Destinations may carry query/hash filters (e.g. "/admin/payouts?tab=failed").
  // Only the pathname decides whether the screen exists.
  const path = href.split(/[?#]/)[0].replace(/\/+$/g, "") || href;
  return BUILT_ROUTES.has(path);
}

export function useAdminNav() {
  const navigate = useNavigate();
  const { canVisit } = useAdminPermissions();

  const go = (href: string | null | undefined, label?: string) => {
    if (!href || !isBuiltAdminRoute(href)) {
      toast({
        title: "Coming soon",
        description: label
          ? `${label} is on the admin roadmap.`
          : "This admin tool is on the roadmap.",
      });
      return;
    }
    if (!canVisit(href)) {
      toast({
        title: "Access restricted",
        description: label
          ? `You don't have permission to open ${label}.`
          : "You don't have permission to open this screen.",
        variant: "destructive",
      });
      return;
    }
    navigate(href);
  };

  return {
    go,
    isBuilt: isBuiltAdminRoute,
    canVisit: (href: string | null | undefined) =>
      isBuiltAdminRoute(href) && canVisit(href),
    requiredPermission: permissionForPath,
  };
}