import { ShieldOff, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { permissionForPath } from "@/services/admin-route-permissions";

export default function AdminAccessDenied() {
  const location = useLocation();
  const { roles, accessLevel } = useAdminPermissions();
  const required = permissionForPath(location.pathname) ?? "unknown";

  return (
    <AdminLayout title="Access restricted" subtitle="You do not have permission to view this screen.">
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <ShieldOff className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">Access restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not include the permission required to open this screen.
        </p>

        <dl className="mt-6 grid w-full grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-4 text-left text-xs">
          <div>
            <dt className="text-muted-foreground">Required permission</dt>
            <dd className="mt-1 font-mono text-foreground">{required}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Your roles</dt>
            <dd className="mt-1 text-foreground">
              {roles.length ? roles.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Access level</dt>
            <dd className="mt-1 text-foreground capitalize">{accessLevel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Attempted path</dt>
            <dd className="mt-1 font-mono text-foreground truncate">{location.pathname}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/admin/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to admin home
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/admin/access-approvals?requested=${encodeURIComponent(required)}`}>
              Request access
            </Link>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
