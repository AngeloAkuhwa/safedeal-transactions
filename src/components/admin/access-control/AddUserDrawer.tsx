import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, CheckCircle2, IdCard, Info, KeyRound, Loader2, Lock, Send, XCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RolePicker } from "./RolePicker";
import { RoleSummaryCard } from "./RoleSummaryCard";
import { useDrawerSafety } from "@/hooks/useDrawerSafety";
import { useMutationOnce } from "@/hooks/useMutationOnce";
import {
  checkEmailAvailability,
  fetchReportingManagerOptions,
  validateInviteInput,
  type InternalRoleKey,
  type InviteUserInput,
} from "@/services/admin-access-control.service";
import { isProtectedRole, ROLE_LABEL } from "@/services/permission-catalog";
import { DEPARTMENTS } from "@/services/departments.catalog";
import { getTeamsForDepartment } from "@/services/teams.catalog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: InviteUserInput) => Promise<void>;
}

const INITIAL_ROLES: InternalRoleKey[] = ["support_agent"];

const OTHER_TEAM = "__other__";

function SectionHeader({
  icon, title, helper,
}: { icon: ReactNode; title: string; helper: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{helper}</div>
      </div>
    </div>
  );
}

export function AddUserDrawer({ open, onOpenChange, onSubmit }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [department, setDepartment] = useState<string>("");
  const [team, setTeam]           = useState("");
  const [teamPick, setTeamPick]   = useState<string>(""); // dropdown value
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

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail("");
    setDepartment(""); setTeam(""); setTeamPick(""); setJobTitle(""); setManagerId("");
    setExpiresAt(""); setReason("");
    setRoles(INITIAL_ROLES); setPrimary("support_agent");
    setRequire2fa(true); setSendNow(true);
    setEmailTaken(null); setError(null);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  // Reset team whenever department changes to avoid stale mismatches.
  useEffect(() => { setTeamPick(""); setTeam(""); }, [department]);

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
  const teamOptions = useMemo(() => getTeamsForDepartment(department), [department]);
  const teamDisabled = !department;

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

  const isDirty = !!(firstName || lastName || email || jobTitle || reason || managerId);
  const { attemptClose } = useDrawerSafety({ open, isDirty, onClose: () => onOpenChange(false) });
  const submitOnce = useMutationOnce(async () => {
    const draft = buildInput();
    if (!draft) return;
    const v = validateInviteInput(draft);
    if (v.ok === false) { setError(v.error); return; }
    if (emailTaken) { setError("A user with that email already exists."); return; }
    setError(null);
    try {
      await onSubmit(draft);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite.");
    }
  });
  const saving = submitOnce.pending;

  const primaryCta = sendNow ? "Send invitation" : "Save as pending";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) attemptClose(); else onOpenChange(v); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[980px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* Sticky header */}
        <SheetHeader className="shrink-0 border-b border-border bg-muted/30 px-6 py-4">
          <SheetTitle className="text-lg">Invite internal user</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Set up a teammate's identity, placement and access. Privileged roles require approval.
          </p>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            {/* Identity */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
              <SectionHeader
                icon={<IdCard className="h-3.5 w-3.5" />}
                title="Identity"
                helper="Who is this teammate and how do we reach them."
              />
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
                <div className="relative">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ada@safedeal.com"
                    className="pr-9"
                  />
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                    {emailChecking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : emailTaken === true ? (
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                    ) : emailTaken === false && email.trim() ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                  </div>
                </div>
                {emailTaken === true && (
                  <div className="text-[12px] text-rose-400">Already assigned to an internal user.</div>
                )}
                {emailTaken === false && email.trim() && !emailChecking && (
                  <div className="text-[12px] text-emerald-400">Email is available.</div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Employee ID</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value=""
                    placeholder="Auto-generated on invite"
                    className="pr-8 font-mono text-sm border-dashed bg-muted/40 cursor-not-allowed"
                    aria-readonly
                  />
                  <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Info className="h-3 w-3" /> Assigned by the system — cannot be edited.
                </div>
              </div>
            </section>

            {/* Placement */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
              <SectionHeader
                icon={<Building2 className="h-3.5 w-3.5" />}
                title="Placement"
                helper="Where they sit in the org and who they report to."
              />
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
                  <Select
                    value={teamPick}
                    onValueChange={(v) => {
                      setTeamPick(v);
                      if (v !== OTHER_TEAM) setTeam(v);
                      else setTeam("");
                    }}
                    disabled={teamDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={teamDisabled ? "Select a department first" : "Select team"} />
                    </SelectTrigger>
                    <SelectContent>
                      {teamOptions.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                      <SelectItem value={OTHER_TEAM}>Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  {teamPick === OTHER_TEAM && (
                    <Input
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      placeholder="Type team name"
                      className="mt-1"
                    />
                  )}
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
                  {selectedManager && (
                    <div className="text-[12px] text-muted-foreground">
                      Reports to <span className="text-foreground/80">{selectedManager.full_name}</span>
                      {selectedManager.role && (
                        <> · <span className="text-foreground/60">{ROLE_LABEL[selectedManager.role]}</span></>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Access */}
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
              <SectionHeader
                icon={<KeyRound className="h-3.5 w-3.5" />}
                title="Access"
                helper="Assign roles, expiry and justification."
              />
              <div className="space-y-1.5">
                <Label>Roles (star marks primary)<span className="text-rose-400"> *</span></Label>
                <RolePicker roles={roles} primaryRole={primary} onChange={(r, p) => { setRoles(r); setPrimary(p); }} />
                {primary && (
                  <div className="text-[12px] text-muted-foreground">
                    Primary role: <span className="text-foreground/80">{primaryLabel}</span>
                    {selectedManager && <> · Reports to <span className="text-foreground/80">{selectedManager.full_name}</span></>}
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
            <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
              <SectionHeader
                icon={<Send className="h-3.5 w-3.5" />}
                title="Delivery & security"
                helper="How the invite is sent and initial MFA policy."
              />
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
          </div>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <RoleSummaryCard role={primary} rolePermissions={rolePermsQ.data} />
          </aside>
        </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={sendNow} onCheckedChange={setSendNow} />
              <span className="text-foreground/80">Send invitation immediately</span>
              <span className="text-muted-foreground">— off keeps the user pending.</span>
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={attemptClose}>Cancel</Button>
              <Button onClick={() => submitOnce.run()} disabled={saving || !canSubmit}>
                {saving ? "Working…" : primaryCta}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}