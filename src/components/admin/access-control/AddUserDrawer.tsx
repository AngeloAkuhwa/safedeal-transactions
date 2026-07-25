import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { InternalRoleKey, InviteUserInput } from "@/services/admin-access-control.service";
import { validateRoleSet } from "@/services/admin-access-control.service";
import { RolePicker } from "./RolePicker";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: InviteUserInput) => Promise<void>;
}

export function AddUserDrawer({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<InternalRoleKey[]>(["support_agent"]);
  const [primary, setPrimary] = useState<InternalRoleKey | null>("support_agent");
  const [department, setDepartment] = useState("");
  const [require2fa, setRequire2fa] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setEmail("");
    setRoles(["support_agent"]); setPrimary("support_agent");
    setDepartment(""); setRequire2fa(true);
  };

  const validation = validateRoleSet(roles);
  const canSubmit = name.trim() && email.trim() && validation.ok && !!primary;

  const submit = async () => {
    if (!canSubmit || !primary) return;
    setSaving(true);
    try {
      await onSubmit({
        full_name: name.trim(),
        email: email.trim(),
        roles,
        primary_role: primary,
        department: department.trim() || undefined,
        require_2fa: require2fa,
      });
      reset();
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>Invite internal user</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Lovelace" />
          </div>
          <div className="space-y-1.5">
            <Label>Work email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@safedeal.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Roles (star marks primary)</Label>
            <RolePicker roles={roles} primaryRole={primary} onChange={(r, p) => { setRoles(r); setPrimary(p); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Trust & Safety" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Require 2FA</div>
              <div className="text-xs text-muted-foreground">User must enrol MFA before first login.</div>
            </div>
            <Switch checked={require2fa} onCheckedChange={setRequire2fa} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !canSubmit}>
              {saving ? "Sending invite…" : "Send invite"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}