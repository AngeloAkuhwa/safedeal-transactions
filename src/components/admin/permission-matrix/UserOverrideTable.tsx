import { useMemo, useState } from "react";
import { Link } from "react-router";
import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { permissionRepo } from "@/services/permission-repository";
import { useCurrentEnvironment } from "./EnvironmentSwitcher";
import { checkOverrideAllowed } from "@/services/role-guardrails";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OverrideRow } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { PermissionSourceBadge } from "./PermissionSourceBadge";
import { EmptyState } from "./EmptyState";
import { ArrowUpRight, ShieldOff, TimerReset, Filter, History, Eye } from "lucide-react";

type OverrideType = "grant" | "deny" | "temporary";
type OverrideStatus = "active" | "expired";
function classifyType(r: OverrideRow): OverrideType {
  if (r.mode === "revoke") return "deny";
  if (r.expires_at) return "temporary";
  return "grant";
}
function classifyStatus(r: OverrideRow): OverrideStatus {
  if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

interface Filters {
  type: "all" | OverrideType;
  status: "all" | OverrideStatus | "expiring";
  module: string;
  role: "all" | InternalRoleKey;
  q: string;
}
const DEFAULT_FILTERS: Filters = { type: "all", status: "all", module: "all", role: "all", q: "" };

export function UserOverrideTable({ rows, onRowClick, onAudit, canEdit = false, onChanged, onCreate }: {
  rows: OverrideRow[]; onRowClick?: (r: OverrideRow) => void; canEdit?: boolean; onChanged?: () => void;
  onCreate?: () => void; onAudit?: (r: OverrideRow) => void;
}) {
  const env = useCurrentEnvironment();
  const [extendFor, setExtendFor] = useState<OverrideRow | null>(null);
  const [revokeFor, setRevokeFor] = useState<OverrideRow | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const t = classifyType(r);
      const s = classifyStatus(r);
      if (filters.type !== "all" && t !== filters.type) return false;
      if (filters.status === "expiring") {
        if (!r.expires_at) return false;
        const days = (new Date(r.expires_at).getTime() - Date.now()) / 86_400_000;
        if (days < 0 || days > 7) return false;
      } else if (filters.status !== "all" && s !== filters.status) return false;
      if (filters.module !== "all" && r.module_label !== filters.module) return false;
      if (filters.role !== "all" && r.user_role !== filters.role) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!`${r.user_name} ${r.user_email} ${r.permission_key}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return { label: "Never", tone: "muted" as const };
    const d = new Date(iso).getTime();
    const now = Date.now();
    if (d < now) return { label: "Expired", tone: "rose" as const };
    const days = Math.round((d - now) / 86_400_000);
    return { label: days <= 3 ? `In ${days}d` : new Date(iso).toLocaleDateString(), tone: days <= 3 ? "amber" as const : "muted" as const };
  };

  const typePill = (t: OverrideType) => t === "grant"
    ? { label: "Grant", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
    : t === "deny" ? { label: "Deny", cls: "bg-destructive/15 text-destructive border-destructive/30" }
    : { label: "Temporary", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  const statusPill = (s: OverrideStatus) => s === "expired"
    ? { label: "Expired", cls: "bg-muted/40 text-muted-foreground border-border" }
    : { label: "Active", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground"><Filter className="h-3 w-3" /> Filter</div>
        <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Search user, email, key…"
          className="h-8 min-w-[220px] flex-1 rounded-md border border-border bg-background px-2 text-xs relative before:absolute before:-inset-2 before:content-['']" />
        <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as any }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs relative before:absolute before:-inset-2 before:content-['']">
          <option value="all">All types</option><option value="grant">Grant</option><option value="deny">Deny</option><option value="temporary">Temporary</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as any }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs relative before:absolute before:-inset-2 before:content-['']">
          <option value="all">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="expiring">Expiring ≤7d</option>
        </select>
        <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as any }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs relative before:absolute before:-inset-2 before:content-['']">
          <option value="all">All roles</option>
          {INTERNAL_ROLES.map((r) => <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>)}
        </select>
        <select value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs relative before:absolute before:-inset-2 before:content-['']">
          <option value="all">All modules</option>
          {PERMISSION_MODULES.map((m) => <option key={m.key} value={m.label}>{m.label}</option>)}
        </select>
        {(filters.q || filters.type !== "all" || filters.status !== "all" || filters.role !== "all" || filters.module !== "all") && (
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
        )}
        {canEdit && onCreate && (
          <button type="button" onClick={onCreate}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 min-h-11">
            New override
          </button>
        )}
      </div>

      {filtered.length === 0
        ? <EmptyState title="No overrides match" description={rows.length ? "Adjust filters to see more." : "User-specific grants and revokes will show up here."} />
        : (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-separate border-spacing-y-1 text-sm sd-stack">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Permission</th>
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-left font-medium">Source</th>
              <th className="px-4 py-2 text-left font-medium">Effective</th>
              <th className="px-4 py-2 text-left font-medium">Expires</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
              <th className="px-4 py-2 text-right font-medium">Manage</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const exp = fmtExpiry(r.expires_at);
              const t = typePill(classifyType(r));
              const s = statusPill(classifyStatus(r));
              return (
              <tr
                key={r.user_id + r.permission_key + i}
                className="cursor-pointer transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
                onClick={() => onRowClick?.(r)}
              >
                <td className="px-4 py-3 align-middle">
                  <div className="text-sm font-medium text-foreground">{r.user_name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.user_email}</div>
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.user_role ? ROLE_LABEL[r.user_role] : "—"}</td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm">{r.permission_label.split("—")[1]?.trim() ?? r.permission_label}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{r.permission_key}</div>
                    </div>
                    {r.privileged && <PermissionRiskBadge privileged size="xs" />}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.cls}`}>{t.label}</span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <PermissionSourceBadge
                    source={r.source}
                    size="xs"
                    title={r.expires_at ? `Expires ${new Date(r.expires_at).toLocaleString()}` : undefined}
                  />
                </td>
                <td className="px-4 py-3 align-middle text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 align-middle text-[11px]">
                  <span className={
                    exp.tone === "rose" ? "text-rose-400"
                    : exp.tone === "amber" ? "text-amber-300"
                    : "text-muted-foreground"
                  }>{exp.label}</span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>{s.label}</span>
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.reason ?? <span className="italic">—</span>}</td>
                <td className="px-4 py-3 align-middle text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => onRowClick?.(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted min-h-11">
                      <Eye className="h-3 w-3" /> Review
                    </button>
                    {onAudit && (
                      <button type="button" onClick={() => onAudit(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted min-h-11">
                        <History className="h-3 w-3" /> Audit
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => setExtendFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted min-h-11">
                          <TimerReset className="h-3 w-3" /> Extend
                        </button>
                        <button type="button" onClick={() => setRevokeFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 min-h-11">
                          <ShieldOff className="h-3 w-3" /> Revoke
                        </button>
                      </>
                    )}
                    <Link
                      to={`/admin/access-control?user=${r.user_id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted min-h-11"
                    >
                      Open <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
        )}
      <ExtendOverrideDialog row={extendFor} env={env} onOpenChange={(v) => !v && setExtendFor(null)} onDone={onChanged} />
      <RevokeOverrideDialog row={revokeFor} env={env} onOpenChange={(v) => !v && setRevokeFor(null)} onDone={onChanged} />
    </div>
  );
}

function ExtendOverrideDialog({ row, env, onOpenChange, onDone }: { row: OverrideRow | null; env: any; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const expires = new Date(Date.now() + Number(days) * 86_400_000).toISOString();
      await permissionRepo.extendOverride(row.user_id, row.permission_key, env, expires);
      toast({ title: "Override extended", description: `New expiry in ${days} day(s)` });
      onDone?.(); onOpenChange(false);
    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Extend override</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{row?.permission_key} · {row?.user_name}</p>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Extend by (days)</span>
            <input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} max={365}
              className="h-11 w-full rounded-md border border-border bg-background px-2" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Extend</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeOverrideDialog({ row, env, onOpenChange, onDone }: { row: OverrideRow | null; env: any; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useMemo(() => row ? checkOverrideAllowed(row.user_role, row.permission_key, row.mode) : { ok: true }, [row]);
  const submit = async () => {
    if (!row || !reason.trim()) return;
    setBusy(true);
    try {
      await permissionRepo.revokeOverride(row.user_id, row.permission_key, env, reason);
      toast({ title: "Override revoked" });
      onDone?.(); onOpenChange(false);
    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Revoke override</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{row?.permission_key} · {row?.user_name}</p>
          {!guard.ok && guard.message && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">{guard.message}</div>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Reason (required)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Audit rationale" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !reason.trim()} variant="destructive">Revoke</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
