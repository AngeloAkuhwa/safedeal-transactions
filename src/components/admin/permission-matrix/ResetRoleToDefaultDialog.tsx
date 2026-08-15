import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type InternalRoleKey, isPrivilegedPermission } from "@/services/permission-catalog";
import type { PermissionEnvironment } from "@/services/permission-repository";
import { computeRoleResetDiff, stageRoleReset, type ResetRoleDiff } from "@/services/permission-workspace.service";
import { ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ResetRoleToDefaultDialog({
  open, onOpenChange, role, environment, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: InternalRoleKey | null;
  environment: PermissionEnvironment;
  onDone?: () => void;
}) {
  const [diff, setDiff] = useState<ResetRoleDiff | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !role) return;
    setErr(null); setDiff(null); setReason("");
    computeRoleResetDiff(role, environment)
      .then(setDiff)
      .catch((e) => setErr(e?.message ?? String(e)));
  }, [open, role, environment]);

  const privilegedRemoved = useMemo(() => diff?.remove.filter(isPrivilegedPermission) ?? [], [diff]);
  const privilegedAdded = useMemo(() => diff?.add.filter(isPrivilegedPermission) ?? [], [diff]);
  const requiresApproval = privilegedAdded.length > 0 || privilegedRemoved.length > 0;

  const submit = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await stageRoleReset(role, environment, reason.trim() || undefined);
      toast({ title: "Reset staged", description: `Reset for ${ROLE_LABEL[role]} sent for review.` });
      onDone?.(); onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reset {role ? ROLE_LABEL[role] : "role"} to default</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            This stages a change set to bring the role's permissions back to the seeded system baseline. Nothing is applied to <span className="font-semibold">{environment}</span> until it is approved.
          </p>
          {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
          {diff && (
            <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between"><span>Source</span><span className="text-muted-foreground">{diff.source === "system_template" ? "System template" : "Catalog default"}</span></div>
              <div className="flex items-center justify-between"><span>Permissions added back</span><span className="font-mono text-emerald-400">+{diff.add.length}</span></div>
              <div className="flex items-center justify-between"><span>Permissions removed</span><span className="font-mono text-rose-400">−{diff.remove.length}</span></div>
              <div className="flex items-center justify-between"><span>Privileged introduced</span><span className="font-mono text-amber-300">{privilegedAdded.length}</span></div>
              <div className="flex items-center justify-between"><span>Privileged removed</span><span className="font-mono text-amber-300">{privilegedRemoved.length}</span></div>
              <div className="flex items-center justify-between">
                <span>Approval required</span>
                <span className={requiresApproval ? "text-amber-300" : "text-muted-foreground"}>{requiresApproval ? "Yes" : "No"}</span>
              </div>
            </div>
          )}
          {diff && requiresApproval && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[12px] text-amber-200">
              <ShieldAlert className="mt-0.5 h-3 w-3" />
              <span>Reset touches privileged permissions. Super Admin approval is required.</span>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] uppercase text-muted-foreground">Reason (optional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Why reset now?" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !diff}>Stage reset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
