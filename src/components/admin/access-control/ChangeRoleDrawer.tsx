import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InternalRoleKey, InternalUser } from "@/services/admin-access-control.service";
import { validateRoleSet } from "@/services/admin-access-control.service";
import { RolePicker } from "./RolePicker";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (roles: InternalRoleKey[], primary: InternalRoleKey, reason: string) => Promise<void>;
}

export function ChangeRoleDrawer({ user, open, onOpenChange, onSubmit }: Props) {
  const [roles, setRoles] = useState<InternalRoleKey[]>([]);
  const [primary, setPrimary] = useState<InternalRoleKey | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setRoles(user.roles);
      setPrimary(user.primary_role);
      setReason("");
    }
  }, [user]);

  const validation = validateRoleSet(roles);
  const canSubmit = validation.ok && !!primary && reason.trim().length >= 8;

  const submit = async () => {
    if (!canSubmit || !primary) return;
    setSaving(true);
    try { await onSubmit(roles, primary, reason.trim()); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change roles — {user?.full_name ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Roles (star marks primary)</Label>
            <RolePicker roles={roles} primaryRole={primary} onChange={(r, p) => { setRoles(r); setPrimary(p); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (audited)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this change is required…" />
            <p className="text-xs text-muted-foreground">Minimum 8 characters. Protected-role changes may require approval.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Saving…" : "Save change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}