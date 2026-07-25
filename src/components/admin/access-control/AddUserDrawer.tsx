import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  AccessLevel, InternalRole, InviteUserInput,
} from "@/services/admin-access-control.service";
import { ACCESS_LABEL, ROLE_LABEL } from "@/services/admin-access-control.service";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: InviteUserInput) => Promise<void>;
}

export function AddUserDrawer({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InternalRole>("agent");
  const [access, setAccess] = useState<AccessLevel>("standard");
  const [department, setDepartment] = useState("");
  const [require2fa, setRequire2fa] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setRole("agent"); setAccess("standard");
    setDepartment(""); setRequire2fa(true);
  };

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ full_name: name.trim(), email: email.trim(), role, access_level: access, department: department.trim() || undefined, require_2fa: require2fa });
      reset();
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InternalRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Access level</Label>
              <Select value={access} onValueChange={(v) => setAccess(v as AccessLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCESS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Button onClick={submit} disabled={saving || !name || !email}>
              {saving ? "Sending invite…" : "Send invite"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}