import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

/** Routes that actually exist in the router. Everything else is "Coming soon". */
const BUILT_ROUTES = new Set<string>([
  "/admin/dashboard",
  "/admin/offers",
  "/admin/transactions",
  "/admin/disputes",
  "/admin/payouts",
  "/admin/escrow",
  "/admin/reconciliation",
  "/admin/flagged-users",
  "/admin/users",
  "/admin/notifications",
  "/admin/settings",
  "/admin/audit-logs",
  "/admin/access-control",
]);

export function isBuiltAdminRoute(href: string | null | undefined): boolean {
  if (!href) return false;
  return BUILT_ROUTES.has(href);
}

export function useAdminNav() {
  const navigate = useNavigate();

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
    navigate(href);
  };

  return { go, isBuilt: isBuiltAdminRoute };
}