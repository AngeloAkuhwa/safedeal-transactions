import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { permissionRepo, type PermissionEnvironment } from "@/services/permission-repository";
import { checkOverrideAllowed } from "@/services/role-guardrails";
import { toast } from "@/hooks/use-toast";
import { History, ShieldOff, TimerReset } from "lucide-react";
import type { OverrideRow } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { PermissionSourceBadge } from "./PermissionSourceBadge";
import { ROLE_LABEL } from "@/services/permission-catalog";
import { Link } from "react-router";

export function PermissionDetailsDrawer({
  override,
  open,
  onOpenChange,
  canEdit = false,
  environment,
  onChanged,
  onAudit,
}: {
  override: OverrideRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit?: boolean;
  environment?: PermissionEnvironment;
  onChanged?: () => void;
  onAudit?: (o: OverrideRow) => void;
}) {
  const [extendDays, setExtendDays] = useState("30");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const guard = useMemo(
    () => override ? checkOverrideAllowed(override.user_role, override.permission_key, override.mode, { isPrivileged: override.privileged, expiresAt: override.expires_at }) : { ok: true },
    [override],
  );

  const doExtend = async () => {
    if (!override || !environment) return;
    setBusy(true);
    try {
      const expires = new Date(Date.now() + Number(extendDays) * 86_400_000).toISOString();
      await permissionRepo.extendOverride(override.user_id, override.permission_key, environment, expires);
      toast({ title: "Override extended", description: `New expiry in ${extendDays} day(s)` });
      onChanged?.(); onOpenChange(false);
    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const doRevoke = async () => {
    if (!override || !environment || !revokeReason.trim()) return;
    setBusy(true);
    try {
      await permissionRepo.revokeOverride(override.user_id, override.permission_key, environment, revokeReason.trim());
      toast({ title: "Override revoked" });
      onChanged?.(); onOpenChange(false);
    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review permission override</SheetTitle>
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
              <div className="font-mono text-[12px] text-muted-foreground">{override.permission_key}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Type</div>
              <div className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold" style={{
                borderColor: override.mode === "grant" ? "rgb(16 185 129 / 0.4)" : "rgb(239 68 68 / 0.4)",
              }}>
                {override.mode === "grant" ? (override.expires_at ? "Temporary" : "Grant") : "Deny"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Source</div>
              <div className="flex flex-wrap items-center gap-2">
                <PermissionSourceBadge source={override.source} />
                {override.expires_at && (
                  <span className="text-[12px] text-muted-foreground">
                    Expires {new Date(override.expires_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Effective</div>
                <div className="text-xs">{new Date(override.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Expires</div>
                <div className="text-xs">{override.expires_at ? new Date(override.expires_at).toLocaleString() : "Never"}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Reason</div>
              <div className="text-muted-foreground">{override.reason ?? "—"}</div>
            </div>
            {!guard.ok && (guard as any).message && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[12px] text-amber-200">{(guard as any).message}</div>
            )}

            {canEdit && environment && (
              <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
                <div className="text-[12px] font-semibold uppercase text-muted-foreground">Manage</div>
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="mb-1 block text-[12px] uppercase text-muted-foreground">Extend by (days)</span>
                    <input value={extendDays} onChange={(e) => setExtendDays(e.target.value)} type="number" min={1} max={365}
                      className="h-11 w-full rounded-md border border-border bg-background px-2 text-xs" />
                  </label>
                  <Button size="sm" variant="outline" disabled={busy} onClick={doExtend}>
                    <TimerReset className="mr-1 h-3 w-3" /> Extend
                  </Button>
                </div>
                <div>
                  <span className="mb-1 block text-[12px] uppercase text-muted-foreground">Revoke reason</span>
                  <textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={2}
                    className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Required to revoke" />
                  <Button size="sm" variant="destructive" disabled={busy || !revokeReason.trim()} onClick={doRevoke} className="mt-2">
                    <ShieldOff className="mr-1 h-3 w-3" /> Revoke override
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => onAudit?.(override)}>
                <History className="mr-1 h-3 w-3" /> View audit history
              </Button>
              <Link
                to={`/admin/access-control?user=${override.user_id}`}
                className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground min-h-11"
              >
                Manage in Users &amp; Access
              </Link>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
