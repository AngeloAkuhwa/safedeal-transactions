import { Outlet, useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { permissionForPath } from "@/services/admin-route-permissions";
import BrandedAuthSplash from "./BrandedAuthSplash";
import AdminAccessDenied from "@/pages/AdminAccessDenied";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";

interface PermissionRouteProps {
  /**
   * Optional explicit permission override. When omitted, the required
   * permission is derived from the current pathname via the route map.
   */
  permission?: string;
}

export default function PermissionRoute({ permission }: PermissionRouteProps) {
  const location = useLocation();
  const { loading, error, has, isSuper, refresh } = useAdminPermissions();

  if (loading) return <BrandedAuthSplash />;

  if (error) {
    return (
      <AdminLayout title="Admin access check" subtitle="We could not verify your screen permissions.">
        <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <RefreshCw className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-foreground">Could not load admin permissions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your session is active, but the admin permission service did not respond correctly.
          </p>
          <p className="mt-4 max-w-md rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            {error}
          </p>
          <Button type="button" onClick={() => refresh()} className="mt-6">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const required = permission ?? permissionForPath(location.pathname);
  if (!required || isSuper || has(required)) {
    return <Outlet />;
  }

  return <AdminAccessDenied />;
}
