import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OverrideRow } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { ROLE_LABEL } from "@/services/permission-catalog";
import { Link } from "react-router-dom";

export function PermissionDetailsDrawer({
  override,
  open,
  onOpenChange,
}: {
  override: OverrideRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Permission override</SheetTitle>
        </SheetHeader>
        {override && (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground">User</div>
              <div className="font-medium">{override.user_name}</div>
              <div className="text-xs text-muted-foreground">{override.user_email}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Role</div>
              <div>{override.user_role ? ROLE_LABEL[override.user_role] : "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Permission</div>
              <div className="flex items-center gap-2">
                <span>{override.permission_label}</span>
                {override.privileged && <PermissionRiskBadge privileged size="xs" />}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">{override.permission_key}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Mode</div>
              <div>{override.mode === "grant" ? "+ Grant" : "− Revoke"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Reason</div>
              <div className="text-muted-foreground">{override.reason ?? "—"}</div>
            </div>
            <Link
              to={`/admin/access-control?user=${override.user_id}`}
              className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Manage in Users &amp; Access
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
