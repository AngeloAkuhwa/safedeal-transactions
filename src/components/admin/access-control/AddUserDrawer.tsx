import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RolePicker } from "./RolePicker";
import { RoleSummaryCard } from "./RoleSummaryCard";
import {
  checkEmailAvailability,
  fetchReportingManagerOptions,
  validateInviteInput,
  type InternalRoleKey,
  type InviteUserInput,
} from "@/services/admin-access-control.service";
import { isProtectedRole, ROLE_LABEL } from "@/services/permission-catalog";
import { DEPARTMENTS } from "@/services/departments.catalog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: InviteUserInput) => Promise<void>;
}

const INITIAL_ROLES: InternalRoleKey[] = ["support_agent"];

export function AddUserDrawer({ open, onOpenChange, onSubmit }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [department, setDepartment] = useState<string>("");
  const [team, setTeam]           = useState("");
  const [jobTitle, setJobTitle]   = useState("");
  const [managerId, setManagerId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason]       = useState("");
  const [roles, setRoles]         = useState<InternalRoleKey[]>(INITIAL_ROLES);
  const [primary, setPrimary]     = useState<InternalRoleKey | null>("support_agent");
  const [require2fa, setRequire2fa] = useState(true);
  const [sendNow, setSendNow]     = useState(true);
  const [emailTaken, setEmailTaken] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail("");
    setDepartment(""); setTeam(""); setJobTitle(""); setManagerId("");
    setExpiresAt(""); setReason("");
    setRoles(INITIAL_ROLES); setPrimary("support_agent");
    setRequire2fa(true); setSendNow(true);
    setEmailTaken(null); setError(null);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  // Debounced duplicate-email check.
  useEffect(() => {
    if (!email.trim()) { setEmailTaken(null); return; }
    setEmailChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await checkEmailAvailability(email.trim());
        setEmailTaken(!res.available);
      } finally { setEmailChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [email]);

  const managersQ = useQuery({
    queryKey: ["reporting-manager-options"],
    queryFn: fetchReportingManagerOptions,
    enabled: open,
    staleTime: 60_000,
  });

  // Effective permissions for the currently selected primary role.
  const rolePermsQ = useQuery({
    queryKey: ["role-permissions", primary],
    enabled: !!primary,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!primary) return [] as string[];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("role_key", primary);
      if (error) return [];
      return (data ?? []).map((r) => r.permission_key as string);
    },
  });

  const requiresApproval = roles.some(isProtectedRole);
  const selectedManager = managersQ.data?.find((m) => m.id === managerId);
  const primaryLabel = primary ? ROLE_LABEL[primary] : "";

  const buildInput = (): InviteUserInput | null => {
    if (!primary) return null;
    const full = `${firstName.trim()} ${lastName.trim()}`.trim();
    return {
      full_name: full,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      roles,
      primary_role: primary,
      department,
      team: team.trim() || undefined,
      job_title: jobTitle.trim() || undefined,
      reporting_manager_id: managerId || null,
      access_expires_at: expiresAt || null,
      reason: reason.trim() || undefined,
      send_invitation: sendNow,
      require_2fa: require2fa,
    };
  };

  const canSubmit = useMemo(() => {
    const draft = buildInput();
    if (!draft) return false;
    if (emailTaken) return false;
    const v = validateInviteInput(draft);
    return v.ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, email, department, roles, primary, reason, emailTaken]);

  const submit = async () => {
    const draft = buildInput();
    if (!draft) return;
    const v = validateInviteInput(draft);
    if (!v.ok) { setError(v.error); return; }
    if (emailTaken) { setError("A user with that email already exists."); return; }
    setError(null); setSaving(true);
    try {
      await onSubmit(draft);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite.");
    } finally { setSaving(false); }
  };

  const primaryCta = sendNow ? "Send invitation" : "Save as pending";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle>Invite internal user</SheetTitle></SheetHeader>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-5">
            {/* Identity */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>First name<span className="text-rose-400"> *</span></Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ada" />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name<span className="text-rose-400"> *</span></Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Lovelace" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Work email<span className="text-rose-400"> *</span></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ada@safedeal.com"
                />
                {emailChecking && <div className="text-[11px] text-muted-foreground">Checking availability…</div>}
                {emailTaken === true && <div className="text-[11px] text-rose-400">That email is already assigned to an internal user.</div>}
              </div>
              <div className="space-y-1.5">
                <Label>Employee ID</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value=""
                    placeholder="Auto-generated on invite"
                    className="pr-8 font-mono text-sm"
                    aria-readonly
                  />
                  <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3" /> Assigned by the system — cannot be edited.
                </div>
              </div>
            </section>

            {/* Placement */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placement</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Department<span className="text-rose-400"> *</span></Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d.key} value={d.label}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Team</Label>
                  <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. High-value cases" />
                </div>
                <div className="space-y-1.5">
                  <Label>Job title</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Dispute Analyst" />
                </div>
                <div className="space-y-1.5">
                  <Label>Reporting manager</Label>
                  <Select value={managerId || "__none__"} onValueChange={(v) => setManagerId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No direct manager</SelectItem>
                      {(managersQ.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name}{m.role ? ` · ${ROLE_LABEL[m.role]}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Access */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</h4>
              <div className="space-y-1.5">
                <Label>Roles (star marks primary)<span className="text-rose-400"> *</span></Label>
                <RolePicker roles={roles} primaryRole={primary} onChange={(r, p) => { setRoles(r); setPrimary(p); }} />
                {selectedManager && primary && (
                  <div className="text-[11px] text-muted-foreground">
                    Reports to <span className="text-foreground/80">{selectedManager.full_name}</span>
                    {selectedManager.role ? <> · <span className="text-foreground/60">{ROLE_LABEL[selectedManager.role]}</span></> : null}
                    {primaryLabel && <> · Primary role <span className="text-foreground/80">{primaryLabel}</span></>}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Access expiry (optional)</Label>
                  <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Reason for access{requiresApproval && <span className="text-rose-400"> *</span>}
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder={requiresApproval
                    ? "Required for privileged roles — recorded on the access change request."
                    : "Optional justification for the audit trail."}
                />
              </div>
            </section>

            {/* Delivery */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h4>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
                <div>
                  <div className="text-sm font-medium">Send invitation immediately</div>
                  <div className="text-xs text-muted-foreground">Turn off to create the user in a pending state.</div>
                </div>
                <Switch checked={sendNow} onCheckedChange={setSendNow} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
                <div>
                  <div className="text-sm font-medium">Require 2FA</div>
                  <div className="text-xs text-muted-foreground">User must enrol MFA before first login.</div>
                </div>
                <Switch checked={require2fa} onCheckedChange={setRequire2fa} />
              </div>
            </section>

            {error && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !canSubmit}>
                {saving ? "Working…" : primaryCta}
              </Button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-4 lg:h-fit">
            <RoleSummaryCard role={primary} rolePermissions={rolePermsQ.data} />
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}