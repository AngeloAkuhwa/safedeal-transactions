import { ShieldOff } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ADMIN_TONE } from "@/components/admin/palette";

export function PermissionDeniedState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-16 text-center">
      <ShieldOff className={`mb-3 h-8 w-8 ${ADMIN_TONE.danger.text}`} />
      <h3 className="text-base font-semibold text-foreground">You don't have access to this directory</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Managing internal users requires an admin role with the "Users &amp; Access" permission. Ask a Super Admin to grant you access.
      </p>
      <Button asChild className="mt-4" variant="outline" size="sm">
        <Link to="/admin">Return to dashboard</Link>
      </Button>
    </div>
  );
}