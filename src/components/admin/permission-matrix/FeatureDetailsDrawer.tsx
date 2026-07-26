import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL, isPrivilegedPermission } from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { Check, Minus } from "lucide-react";

export function FeatureDetailsDrawer({
  permissionKey,
  open,
  onOpenChange,
  roleMap,
  overrideCount,
}: {
  permissionKey: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleMap: RoleGrantMap;
  overrideCount: number;
}) {
  const meta = permissionKey
    ? PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => ({ ...p, moduleLabel: m.label })))
        .find((p) => p.key === permissionKey)
    : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{meta ? meta.label : "Permission"}</SheetTitle>
        </SheetHeader>
        {meta && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <PermissionRiskBadge privileged={isPrivilegedPermission(meta.key)} />
              <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{meta.key}</span>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Module</div>
              <div>{meta.moduleLabel}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">User overrides</div>
              <div className="text-lg font-semibold">{overrideCount}</div>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase text-muted-foreground">Granted to</div>
              <ul className="space-y-1">
                {INTERNAL_ROLES.map((r) => {
                  const has = roleMap.map.get(r.key)?.has(meta.key);
                  return (
                    <li key={r.key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${has ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}>
                      {has ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={has ? "" : "text-muted-foreground"}>{ROLE_LABEL[r.key]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
