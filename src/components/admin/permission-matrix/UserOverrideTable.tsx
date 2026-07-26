import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_LABEL } from "@/services/permission-catalog";
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
import { ArrowUpRight, CalendarClock, ShieldOff, TimerReset } from "lucide-react";

export function UserOverrideTable({ rows, onRowClick, canEdit = false, onChanged }: {
  rows: OverrideRow[]; onRowClick?: (r: OverrideRow) => void; canEdit?: boolean; onChanged?: () => void;
}) {
  const env = useCurrentEnvironment();
  const [extendFor, setExtendFor] = useState<OverrideRow | null>(null);
  const [revokeFor, setRevokeFor] = useState<OverrideRow | null>(null);
  if (!rows.length) return <EmptyState title="No overrides recorded" description="User-specific grants and revokes will show up here." />;

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return { label: "Never", tone: "muted" as const };
    const d = new Date(iso).getTime();
    const now = Date.now();
    if (d < now) return { label: "Expired", tone: "rose" as const };
    const days = Math.round((d - now) / 86_400_000);
    return { label: days <= 3 ? `In ${days}d` : new Date(iso).toLocaleDateString(), tone: days <= 3 ? "amber" as const : "muted" as const };
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Permission</th>
              <th className="px-4 py-2 text-left font-medium">Mode</th>
              <th className="px-4 py-2 text-left font-medium">Source</th>
              <th className="px-4 py-2 text-left font-medium">Expires</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
              <th className="px-4 py-2 text-right font-medium">Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const exp = fmtExpiry(r.expires_at);
              return (
              <tr
                key={r.user_id + r.permission_key + i}
                className="transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
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
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${r.mode === "grant" ? "bg-emerald-500/15 text-emerald-300" : "bg-destructive/15 text-destructive"}`}>
                    {r.mode === "grant" ? "+ Grant" : "− Revoke"}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <PermissionSourceBadge
                    source={r.source}
                    size="xs"
                    title={r.expires_at ? `Expires ${new Date(r.expires_at).toLocaleString()}` : undefined}
                  />
                </td>
                <td className="px-4 py-3 align-middle text-[11px]">
                  <span className={
                    exp.tone === "rose" ? "text-rose-400"
                    : exp.tone === "amber" ? "text-amber-300"
                    : "text-muted-foreground"
                  }>{exp.label}</span>
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.reason ?? <span className="italic">—</span>}</td>
                <td className="px-4 py-3 align-middle text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => setExtendFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted">
                          <TimerReset className="h-3 w-3" /> Extend
                        </button>
                        <button type="button" onClick={() => setRevokeFor(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20">
                          <ShieldOff className="h-3 w-3" /> Revoke
                        </button>
                      </>
                    )}
                    <Link
                      to={`/admin/access-control?user=${r.user_id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                      onClick={() => onRowClick?.(r)}
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
              className="h-9 w-full rounded-md border border-border bg-background px-2" />
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
