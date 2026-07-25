import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InternalUser } from "@/services/admin-access-control.service";
import { ROLE_LABEL } from "@/services/admin-access-control.service";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * Reactivate flow — deliberately separate from Suspend so the two never
 * share a modal. Requires a short reason and a single explicit confirm.
 */
export function ReactivateUserDialog({ user, open, onOpenChange, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason(""); setBusy(false); } }, [open]);

  const canSubmit = !busy && reason.trim().length >= 8 && !!user;

  const submit = async () => {
    if (!canSubmit || !user) return;
    setBusy(true);
    try { await onConfirm(reason.trim()); onOpenChange(false); }
    finally { setBusy(false); }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-400" />
            Reactivate user
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-sm font-semibold text-foreground">{user.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {ROLE_LABEL[user.primary_role]} · <span className="font-mono">{user.employee_id}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason for reactivation<span className="text-rose-400"> *</span></Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded to the audit trail (min 8 characters)."
          />
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-200">
          Sign-in and task assignment resume immediately. Existing overrides and audit history are preserved.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Working…" : "Reactivate user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}