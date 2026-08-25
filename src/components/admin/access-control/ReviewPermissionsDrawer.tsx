import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Ban, Check, Clock, ExternalLink, FileClock, KeyRound, Layers, Loader2,
  Minus, Plus, ShieldCheck, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  fetchUserOverrides,
  fetchPendingRequestsForUser,
  requestPermissionOverride,
  PERMISSION_MODULES,
  ROLE_LABEL,
  isPrivilegedPermission,
  relativeTime,
  type AccessChangeRequest,
  type InternalUser,
  type OverrideDetail,
} from "@/services/admin-access-control.service";
import { toast } from "sonner";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const MODULE_LABEL = new Map(PERMISSION_MODULES.map((m) => [m.key, m.label]));

function groupByModule(keys: string[]): Array<{ module: string; label: string; keys: string[] }> {
  const map = new Map<string, string[]>();
  for (const k of keys) {
    const mod = k.split(".")[0];
    const arr = map.get(mod) ?? [];
    arr.push(k);
    map.set(mod, arr);
  }
  return Array.from(map.entries())
    .map(([module, ks]) => ({ module, label: MODULE_LABEL.get(module) ?? module, keys: ks.sort() }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function SectionCard({
  icon, title, subtitle, count, tone = "default", children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  count?: number;
  tone?: "default" | "rose" | "emerald" | "amber";
  children: React.ReactNode;
}) {
  const toneRing = {
    default: "ring-border/30",
    rose:    "ring-rose-500/20",
    emerald: "ring-emerald-500/20",
    amber:   "ring-amber-500/20",
  }[tone];
  return (
    <section className={`rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/60 p-4 shadow-sm ring-1 ${toneRing} space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-foreground/80">
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {typeof count === "number" && (
          <Badge variant="outline" className="text-xs">{count}</Badge>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReviewPermissionsDrawer({ user, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [requestOpen, setRequestOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ key: string; mode: "grant" | "revoke" } | null>(null);

  const overridesQ = useQuery({
    enabled: !!user && open,
    queryKey: ["user-overrides", user?.id],
    queryFn: () => fetchUserOverrides(user!.id),
    staleTime: 15_000,
  });
  const pendingQ = useQuery({
    enabled: !!user && open,
    queryKey: ["user-pending-requests", user?.id],
    queryFn: () => fetchPendingRequestsForUser(user!.id),
    staleTime: 15_000,
  });

  const overrides = overridesQ.data ?? [];
  const grants = overrides.filter((o) => o.mode === "grant");
  const revokes = overrides.filter((o) => o.mode === "revoke");
  const pending = pendingQ.data ?? [];

  const inheritedGroups = useMemo(() => user ? groupByModule(user.base_permissions) : [], [user]);

  const restrictedAll = useMemo(() => {
    if (!user) return [] as string[];
    const eff = new Set(user.permissions);
    return PERMISSION_MODULES.flatMap((m) => m.permissions)
      .filter((p) => isPrivilegedPermission(p.key))
      .filter((p) => !eff.has(p.key))
      .map((p) => p.key)
      .sort();
  }, [user]);
  const RESTRICTED_CAP = 10;

  const openRequest = (prefillArg?: { key: string; mode: "grant" | "revoke" }) => {
    setPrefill(prefillArg ?? null);
    setRequestOpen(true);
  };

  if (!user) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[960px] p-0 flex flex-col gap-0 overflow-hidden">
          <SheetHeader className="shrink-0 border-b border-border bg-muted/30 px-6 py-4">
            <SheetTitle className="text-lg">Review permissions: {user.full_name}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              Read-only view. Individual overrides are requested here. The role template is edited from the permission matrix.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Inherited */}
            <SectionCard
              icon={<Layers className="h-3.5 w-3.5" />}
              title="Permissions inherited from role"
              subtitle={`From: ${ROLE_LABEL[user.primary_role]}`}
              count={user.base_permissions.length}
            >
              {inheritedGroups.length === 0 ? (
                <div className="text-xs text-muted-foreground">No inherited permissions.</div>
              ) : (
                <div className="space-y-2">
                  {inheritedGroups.map((g) => (
                    <div key={g.module}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.keys.map((k) => (
                          <span key={k} className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground/80">
                            {k.split(".")[1]}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Overrides */}
            <SectionCard
              icon={<KeyRound className="h-3.5 w-3.5" />}
              title="Individual permission overrides"
              subtitle="Explicit grants and revokes on top of the role template."
              count={overrides.length}
            >
              {overridesQ.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : overrides.length === 0 ? (
                <div className="text-xs text-muted-foreground">No individual overrides.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <OverrideList
                    tone="emerald"
                    title="Granted"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    items={grants}
                    onRequestRemove={(k) => openRequest({ key: k, mode: "revoke" })}
                  />
                  <OverrideList
                    tone="rose"
                    title="Revoked"
                    icon={<Minus className="h-3.5 w-3.5" />}
                    items={revokes}
                    onRequestRemove={(k) => openRequest({ key: k, mode: "grant" })}
                  />
                </div>
              )}
            </SectionCard>

            {/* Temporary: schema stores no expiry today; keep the section but explain */}
            <SectionCard
              icon={<Clock className="h-3.5 w-3.5" />}
              title="Temporary access"
              subtitle="Time-boxed grants automatically revoke on expiry."
              count={0}
            >
              <div className="text-xs text-muted-foreground">
                No time-boxed grants active. Request one below with an expiry date.
              </div>
            </SectionCard>

            {/* Restricted */}
            <SectionCard
              icon={<Ban className="h-3.5 w-3.5" />}
              title="Restricted permissions"
              subtitle="High-signal actions this user cannot perform."
              tone="rose"
              count={restrictedAll.length}
            >
              {restrictedAll.length === 0 ? (
                <div className="text-xs text-muted-foreground">No restrictions: user has full privileged access.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {restrictedAll.slice(0, RESTRICTED_CAP).map((k) => (
                    <span
                      key={k}
                      title={k}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-200"
                    >
                      <Ban className="h-3 w-3" /> {k}
                    </span>
                  ))}
                  {restrictedAll.length > RESTRICTED_CAP && (
                    <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                      +{restrictedAll.length - RESTRICTED_CAP} more
                    </span>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Pending */}
            <SectionCard
              icon={<FileClock className="h-3.5 w-3.5" />}
              title="Pending changes"
              subtitle="Awaiting approver decision."
              tone="amber"
              count={pending.length}
            >
              {pendingQ.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : pending.length === 0 ? (
                <div className="text-xs text-muted-foreground">No pending changes.</div>
              ) : (
                <div className="space-y-1.5">
                  {pending.map((p) => (
                    <PendingRow
                      key={p.id}
                      req={p}
                      onView={() => navigate("/admin/access-approvals")}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
              This view is read-only. All requests are audited.
            </div>
          </div>

          {/* Sticky footer */}
          <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin/permission-matrix")}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Permission Matrix
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin/access-approvals")}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> View Pending Approvals
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/admin/audit-logs?ref=${user.id}`)}
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> View Audit History
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button onClick={() => openRequest()}>Request individual override</Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <RequestOverrideDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        user={user}
        prefill={prefill}
        onSubmitted={() => {
          setRequestOpen(false);
          pendingQ.refetch();
        }}
      />
    </>
  );
}

function OverrideList({
  tone, title, icon, items, onRequestRemove,
}: {
  tone: "emerald" | "rose";
  title: string;
  icon: React.ReactNode;
  items: OverrideDetail[];
  onRequestRemove: (permission_key: string) => void;
}) {
  const toneClass = tone === "emerald"
    ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-rose-500/30 bg-rose-500/5";
  const chip = tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className={`rounded-lg border ${toneClass} p-2.5 space-y-1.5`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${chip}`}>
        {icon} {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">None.</div>
      ) : items.map((o) => (
        <div key={o.permission_key} className="flex items-start justify-between gap-2 rounded-md bg-background/40 px-2 py-1.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-foreground/90">{o.permission_key}</div>
            <div className="truncate text-xs text-muted-foreground">
              by {o.granted_by_name ?? "Admin"} · {relativeTime(o.granted_at)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestRemove(o.permission_key)}
            title={tone === "emerald" ? "Request revoke" : "Request re-grant"}
            className="text-muted-foreground hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PendingRow({ req, onView }: { req: AccessChangeRequest; onView: () => void }) {
  const kindLabel = req.change_type === "role" ? "Role change" : "Permission override";
  const payload = req.payload as Record<string, unknown>;
  const summary = req.change_type === "role"
    ? Array.isArray(payload.roles) ? (payload.roles as string[]).join(", ") : "—"
    : `${payload.mode ?? ""} ${payload.permission_key ?? ""}`;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs">{kindLabel}</Badge>
          <span className="truncate text-foreground/80">{summary}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          by {req.requested_by_name ?? "Admin"} · {relativeTime(req.created_at)}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={onView}>View</Button>
    </div>
  );
}

/* ---------------- Request override dialog ---------------- */

function RequestOverrideDialog({
  open, onOpenChange, user, prefill, onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: InternalUser;
  prefill: { key: string; mode: "grant" | "revoke" } | null;
  onSubmitted: () => void;
}) {
  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [permKey, setPermKey] = useState<string>("");
  const [expires, setExpires] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(prefill?.mode ?? "grant");
      setPermKey(prefill?.key ?? "");
      setExpires("");
      setReason("");
      setBusy(false);
    }
  }, [open, prefill]);

  const eff = new Set(user.permissions);
  const options = useMemo(() => {
    return PERMISSION_MODULES.flatMap((m) =>
      m.permissions.map((p) => ({ ...p, moduleLabel: m.label })),
    ).filter((p) => (mode === "grant" ? !eff.has(p.key) : eff.has(p.key)));
  }, [mode, user.permissions.join(",")]);

  const canSubmit = !busy && !!permKey && reason.trim().length >= 12;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await requestPermissionOverride({
        user_id: user.id,
        permission_key: permKey,
        mode,
        expires_at: expires ? new Date(expires).toISOString() : null,
        reason: reason.trim(),
      });
      toast.success("Request submitted for approval");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit request");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request individual override</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Direction</Label>
            <RadioGroup value={mode} onValueChange={(v) => { setMode(v as "grant" | "revoke"); setPermKey(""); }} className="mt-1 flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="grant" id="ov-grant" />
                <span className="inline-flex items-center gap-1 text-emerald-300"><Plus className="h-3 w-3" /> Grant</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="revoke" id="ov-revoke" />
                <span className="inline-flex items-center gap-1 text-rose-300"><Minus className="h-3 w-3" /> Revoke</span>
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Permission<span className="text-rose-400"> *</span></Label>
            <Select value={permKey} onValueChange={setPermKey}>
              <SelectTrigger><SelectValue placeholder={`Choose a permission to ${mode}`} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {options.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No candidates</div>}
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    <span className="inline-flex items-center gap-1.5">
                      {isPrivilegedPermission(o.key) && <span className={ADMIN_TONE.warning.text}>★</span>}
                      <span className="font-mono text-xs">{o.key}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Expiry (optional)</Label>
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason<span className="text-rose-400"> *</span></Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this override is needed (min 12 characters)." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Submitting…" : (<><Check className="mr-1 h-4 w-4" />Submit for approval</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}