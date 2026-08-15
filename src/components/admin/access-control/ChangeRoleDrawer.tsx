import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarIcon, EyeOff, Minus, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  ACCESS_LABEL,
  ROLE_LABEL,
  computeRoleChangeDiff,
  validateRoleSet,
  type InternalRoleKey,
  type InternalUser,
  type AccessLevel,
} from "@/services/admin-access-control.service";
import { RolePicker } from "./RolePicker";
import { useDrawerSafety } from "@/hooks/useDrawerSafety";
import { useMutationOnce } from "@/hooks/useMutationOnce";
import { fetchAssignedWorkImpact } from "@/services/assigned-work.service";
import { Checkbox } from "@/components/ui/checkbox";

const LEVEL_BADGE: Record<AccessLevel, string> = {
  full:     "bg-rose-500/15 text-rose-300 border-rose-500/40",
  high:     "bg-amber-500/15 text-amber-300 border-amber-500/40",
  standard: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  limited:  "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

export interface ChangeRoleSubmission {
  roles: InternalRoleKey[];
  primary: InternalRoleKey;
  effective_at: string;
  expires_at: string | null;
  reason: string;
  requiresApproval: boolean;
}

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (s: ChangeRoleSubmission) => Promise<void>;
}

function toIsoDay(d: Date | undefined): string | null {
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function DatePickerField({
  value, onChange, placeholder, min, disabled,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
  min?: Date;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={min ? (d) => d < min : undefined}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ChangeRoleDrawer({ user, open, onOpenChange, onSubmit }: Props) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [roles, setRoles]     = useState<InternalRoleKey[]>([]);
  const [primary, setPrimary] = useState<InternalRoleKey | null>(null);
  const [reason, setReason]   = useState("");
  const [effective, setEffective] = useState<Date | undefined>(today);
  const [expires, setExpires]     = useState<Date | undefined>(undefined);
  const [ackImpact, setAckImpact] = useState(false);

  useEffect(() => {
    if (user && open) {
      setRoles(user.roles);
      setPrimary(user.primary_role);
      setReason("");
      setEffective(today);
      setExpires(undefined);
      setAckImpact(false);
    }
  }, [user, open, today]);

  const validation = validateRoleSet(roles);

  const diffQ = useQuery({
    enabled: !!user && validation.ok,
    queryKey: ["role-change-diff", user?.id, roles.slice().sort().join(",")],
    staleTime: 60_000,
    queryFn: () => computeRoleChangeDiff(user!, roles),
  });
  const diff = diffQ.data;

  // Rule f — warn when the role change removes permissions required by
  // open work assigned to the target.
  const impactQ = useQuery({
    enabled: !!user && !!diff && diff.removed.length > 0,
    queryKey: ["role-change-impact", user?.id, (diff?.removed ?? []).slice().sort().join(",")],
    staleTime: 30_000,
    queryFn: () => fetchAssignedWorkImpact(user!.id, diff!.removed),
  });
  const impact = impactQ.data;
  const hasImpact = !!impact && (impact.open_items ?? 0) > 0;

  const hasRoleChange = useMemo(() => {
    if (!user) return false;
    const a = [...user.roles].sort().join(",");
    const b = [...roles].sort().join(",");
    return a !== b || user.primary_role !== primary;
  }, [user, roles, primary]);

  const dateOk = !!effective && (!expires || expires > effective);

  const isDirty = hasRoleChange || reason.trim().length > 0;
  const { attemptClose } = useDrawerSafety({ open, isDirty, onClose: () => onOpenChange(false) });
  const submitOnce = useMutationOnce(async () => {
    if (!primary || !effective) return;
    await onSubmit({
      roles, primary,
      effective_at: toIsoDay(effective)!,
      expires_at: toIsoDay(expires),
      reason: reason.trim(),
      requiresApproval,
    });
    onOpenChange(false);
  });
  const saving = submitOnce.pending;
  const canSubmit =
    validation.ok && !!primary && reason.trim().length >= 12 &&
    hasRoleChange && dateOk && !saving && (!hasImpact || ackImpact);

  const requiresApproval = diff?.requiresApproval ?? false;
  const primaryLabel = requiresApproval ? "Submit for approval" : "Apply immediately";

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) attemptClose(); else onOpenChange(v); }}>
      <SheetContent side="right" className="w-full sm:max-w-[960px] p-0 flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 border-b border-border bg-muted/30 px-6 py-4">
          <SheetTitle className="text-lg">Change role — {user.full_name}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Compare current vs new access, set an effective window, and route protected changes to approval.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* --------- Left: form --------- */}
            <div className="min-w-0 space-y-5">
              {/* Current */}
              <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Current role</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{ROLE_LABEL[user.primary_role]}</span>
                  {user.roles.filter((r) => r !== user.primary_role).map((r) => (
                    <Badge key={r} variant="outline" className="text-[12px]">{ROLE_LABEL[r]}</Badge>
                  ))}
                  <Badge variant="outline" className={cn("ml-auto text-[12px]", LEVEL_BADGE[user.access_level])}>
                    {ACCESS_LABEL[user.access_level]}
                  </Badge>
                </div>
              </section>

              {/* New roles */}
              <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">New role</div>
                  {diff && (
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <Badge variant="outline" className={LEVEL_BADGE[user.access_level]}>{ACCESS_LABEL[user.access_level]}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="outline" className={LEVEL_BADGE[diff.newAccessLevel]}>{ACCESS_LABEL[diff.newAccessLevel]}</Badge>
                    </div>
                  )}
                </div>
                <RolePicker
                  roles={roles}
                  primaryRole={primary}
                  onChange={(r, p) => { setRoles(r); setPrimary(p); }}
                />
              </section>

              {/* Dates */}
              <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Effective window</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Effective date<span className="text-rose-400"> *</span></Label>
                    <DatePickerField value={effective} onChange={setEffective} min={today} placeholder="Pick a date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiry (optional)</Label>
                    <DatePickerField value={expires} onChange={setExpires} min={effective ?? today} placeholder="No expiry" />
                    {expires && effective && expires <= effective && (
                      <div className="text-[12px] text-rose-400">Expiry must be after the effective date.</div>
                    )}
                  </div>
                </div>
                {expires && (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[12px] text-sky-200">
                    An expiry auto-reverts this role change on the selected date.
                  </div>
                )}
              </section>

              {/* Reason */}
              <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
                <Label>Reason for change<span className="text-rose-400"> *</span></Label>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Recorded on the audit trail and access change request (min 12 characters)."
                />
                <div className="text-[12px] text-muted-foreground">{reason.trim().length}/12 minimum</div>
              </section>

              {!hasRoleChange && (
                <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  Change the role selection or primary to enable submission.
                </div>
              )}

              {hasImpact && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    This will affect {impact?.open_items ?? 0} open item{(impact?.open_items ?? 0) === 1 ? "" : "s"}
                  </div>
                  <div className="text-[12px] text-foreground/80">
                    Removing these permissions may prevent this user from finishing work already assigned to them
                    ({(impact?.affected_modules ?? []).join(", ") || "open tasks in affected modules"}). Consider reassigning first.
                  </div>
                  <label className="flex items-start gap-2 text-[12px] text-foreground/90">
                    <Checkbox checked={ackImpact} onCheckedChange={(v) => setAckImpact(!!v)} className="mt-0.5" />
                    <span>I understand this impacts open work and want to proceed.</span>
                  </label>
                </div>
              )}
            </div>

            {/* --------- Right: diff panel --------- */}
            <aside className="lg:sticky lg:top-0 lg:self-start">
              <div className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/60 p-4 shadow-sm ring-1 ring-border/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">Permission difference</div>
                  {requiresApproval && (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[12px]">
                      Approval required
                    </Badge>
                  )}
                </div>

                {!diff ? (
                  <div className="text-xs text-muted-foreground">Calculating…</div>
                ) : (
                  <>
                    <DiffBlock
                      icon={<Plus className="h-3.5 w-3.5" />}
                      tone="emerald"
                      title="Added"
                      items={diff.added}
                    />
                    <DiffBlock
                      icon={<Minus className="h-3.5 w-3.5" />}
                      tone="rose"
                      title="Removed"
                      items={diff.removed}
                    />
                    <DiffBlock
                      icon={<ShieldAlert className="h-3.5 w-3.5" />}
                      tone="amber"
                      title="Privileged introduced"
                      items={diff.privilegedIntroduced}
                    />
                    <div className="space-y-1">
                      <SectionCap tone="rose" icon={<EyeOff className="h-3.5 w-3.5" />}>Modules lost</SectionCap>
                      {diff.unavailableModules.length === 0
                        ? <div className="pl-5 text-[12px] text-muted-foreground">None</div>
                        : (
                          <div className="flex flex-wrap gap-1.5 pl-5">
                            {diff.unavailableModules.map((m) => (
                              <span key={m.key} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[12px] text-rose-200">
                                {m.label}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
                      All changes are logged to the audit trail.
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-muted-foreground">
              {requiresApproval ? (
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This change routes through the approval queue.
                </span>
              ) : (
                <span>Change applies immediately once submitted.</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => submitOnce.run()} disabled={!canSubmit}>
                {saving ? "Working…" : primaryLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionCap({ children, icon, tone }: { children: React.ReactNode; icon: React.ReactNode; tone: "emerald" | "rose" | "amber" | "sky" }) {
  const toneClass = {
    emerald: "text-emerald-300",
    rose:    "text-rose-300",
    amber:   "text-amber-300",
    sky:     "text-sky-300",
  }[tone];
  return (
    <div className={cn("flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]", toneClass)}>
      {icon}
      {children}
    </div>
  );
}

function DiffBlock({ icon, tone, title, items }: { icon: React.ReactNode; tone: "emerald" | "rose" | "amber"; title: string; items: string[] }) {
  const CAP = 8;
  const shown = items.slice(0, CAP);
  const more = Math.max(0, items.length - CAP);
  return (
    <div className="space-y-1">
      <SectionCap tone={tone} icon={icon}>{title} ({items.length})</SectionCap>
      {items.length === 0
        ? <div className="pl-5 text-[12px] text-muted-foreground">None</div>
        : (
          <div className="space-y-0.5 pl-5">
            {shown.map((k) => (
              <div key={k} className="font-mono text-[12px] text-foreground/80">{k}</div>
            ))}
            {more > 0 && <div className="text-[12px] text-muted-foreground">+{more} more</div>}
          </div>
        )}
    </div>
  );
}