import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InternalUser } from "@/services/admin-access-control.service";
import { PERMISSION_CATALOG } from "@/services/admin-access-control.service";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (permissions: string[], reason: string) => Promise<void>;
}

export function ReviewPermissionsDrawer({ user, open, onOpenChange, onSubmit }: Props) {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const superAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (user) {
      setPerms(new Set(user.permissions.filter((p) => p !== "*")));
      setReason("");
    }
  }, [user]);

  const toggle = (key: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const submit = async () => {
    if (reason.trim().length < 8) return;
    setSaving(true);
    try { await onSubmit(Array.from(perms), reason.trim()); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Review permissions — {user?.full_name ?? ""}</SheetTitle>
        </SheetHeader>

        {superAdmin ? (
          <div className="mt-6 rounded-lg border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-200">
            <strong className="block font-semibold">Super Admin</strong>
            Super Admins have wildcard access. Fine-grained permissions cannot be edited here — change the role first.
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {PERMISSION_CATALOG.map((group) => (
              <div key={group.group}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</h4>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  {group.items.map((p) => (
                    <label key={p.key} className="flex cursor-pointer items-start gap-3 text-sm">
                      <Checkbox checked={perms.has(p.key)} onCheckedChange={() => toggle(p.key)} />
                      <div>
                        <div className="font-medium text-foreground">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.key}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="space-y-1.5">
              <Label>Reason (audited)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are these permissions changing?" />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving || reason.trim().length < 8}>
                {saving ? "Saving…" : "Save permissions"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}