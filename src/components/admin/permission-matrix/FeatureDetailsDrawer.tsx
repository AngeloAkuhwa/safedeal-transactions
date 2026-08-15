import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL,
  isPrivilegedPermission, findPermissionEntry,
} from "@/services/permission-catalog";
import type { PermissionEnvironment } from "@/services/permission-repository";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import {
  fetchOverridesForPermission,
  fetchPendingChangesForPermission,
} from "@/services/permission-workspace.service";
import { permissionRepo } from "@/services/permission-repository";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { Check, Minus, ShieldAlert, KeyRound, GitBranch, History as HistoryIcon, Settings2 } from "lucide-react";
import { Ban, Pause, Play } from "lucide-react";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export function FeatureDetailsDrawer({
  permissionKey,
  open,
  onOpenChange,
  roleMap,
  overrideCount,
  environmentMap,
  currentEnvironment = "production",
  canManage = false,
  onEdit,
}: {
  permissionKey: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleMap: RoleGrantMap;
  overrideCount: number;
  environmentMap?: Map<string, PermissionEnvironment[]>;
  currentEnvironment?: PermissionEnvironment;
  canManage?: boolean;
  onEdit?: (key: string) => void;
}) {
  const meta = permissionKey ? findPermissionEntry(permissionKey) : null;
  const qc = useQueryClient();
  const setStatus = useMutation({
    mutationFn: async (status: "active"|"suspended"|"deprecated") => {
      if (!permissionKey) return;
      await permissionRepo.updatePermission(permissionKey, { status });
    },
    onSuccess: (_d, status) => {
      toast({ title: `Permission ${status}` });
      qc.invalidateQueries({ queryKey: ["perm-workspace"] });
    },
    onError: (e: any) => toast({ title: "Could not change status", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const overridesQuery = useQuery({
    queryKey: ["feature-drawer", "overrides", permissionKey, currentEnvironment],
    queryFn: () => fetchOverridesForPermission(permissionKey!, currentEnvironment),
    enabled: !!permissionKey && open,
    staleTime: 30_000,
  });
  const pendingQuery = useQuery({
    queryKey: ["feature-drawer", "pending", permissionKey, currentEnvironment],
    queryFn: () => fetchPendingChangesForPermission(permissionKey!, currentEnvironment),
    enabled: !!permissionKey && open,
    staleTime: 15_000,
  });
  const depsQuery = useQuery({
    queryKey: ["feature-drawer", "deps"],
    queryFn: () => permissionRepo.listPermissionDependencies().catch(() => []),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const conflictsQuery = useQuery({
    queryKey: ["feature-drawer", "conflicts"],
    queryFn: () => permissionRepo.listPermissionConflicts().catch(() => []),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const envs = permissionKey ? (environmentMap?.get(permissionKey) ?? ["production","staging","development"]) : [];
  const deps = (depsQuery.data ?? []).filter((d: any) => d.permission_key === permissionKey).map((d: any) => d.requires_key);
  const conflicts = (conflictsQuery.data ?? []).filter((c: any) => c.a_key === permissionKey || c.b_key === permissionKey);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {meta ? meta.label : "Permission"}
          </SheetTitle>
        </SheetHeader>
        {meta && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <PermissionRiskBadge privileged={isPrivilegedPermission(meta.key)} />
              {isPrivilegedPermission(meta.key) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                  <ShieldAlert className="h-3 w-3" /> Privileged
                </span>
              )}
              <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{meta.key}</span>
              <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                {(meta.status ?? "active")}
              </span>
              {canManage && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(meta.key)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted min-h-11"
                >
                  <Settings2 className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {meta.status !== "active" && (
                  <button type="button" onClick={() => setStatus.mutate("active")} disabled={setStatus.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 min-h-11">
                    <Play className="h-3 w-3" /> Reactivate
                  </button>
                )}
                {meta.status !== "suspended" && (
                  <button type="button" onClick={() => setStatus.mutate("suspended")} disabled={setStatus.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20 min-h-11">
                    <Pause className="h-3 w-3" /> Suspend
                  </button>
                )}
                {meta.status !== "deprecated" && (
                  <button type="button" onClick={() => setStatus.mutate("deprecated")} disabled={setStatus.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 min-h-11">
                    <Ban className="h-3 w-3" /> Deprecate
                  </button>
                )}
                <span className="ml-auto text-[10px] italic text-muted-foreground">Hard delete disabled — use Deprecated</span>
              </div>
            )}

            {meta.description && <p className="text-muted-foreground">{meta.description}</p>}

            <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
              <Row label="Module">{meta.moduleLabel}</Row>
              <Row label="Action"><span className="font-mono text-xs">{meta.action}</span></Row>
              <Row label="Approval">{meta.approval_required ? "Required (change set)" : "Direct edit"}</Row>
              <Row label="Owner">{meta.owner_role ? (ROLE_LABEL[meta.owner_role as keyof typeof ROLE_LABEL] ?? meta.owner_role) : "—"}</Row>
              <Row label="Environments">{envs.map((e) => e[0].toUpperCase() + e.slice(1)).join(", ")}</Row>
              <Row label="Updated">{meta.updated_at ? new Date(meta.updated_at).toLocaleString() : "—"}</Row>
              <Row label="Overrides"><span className="font-mono">{overrideCount}</span></Row>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Roles using this permission
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {INTERNAL_ROLES.map((r) => {
                  const has = roleMap.map.get(r.key)?.has(meta.key);
                  return (
                    <li key={r.key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${has ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}>
                      {has ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={has ? "" : "text-muted-foreground"}>{ROLE_LABEL[r.key]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" /> Dependencies
              </div>
              {deps.length === 0
                ? <div className="text-xs text-muted-foreground">No prerequisites.</div>
                : (
                  <ul className="flex flex-wrap gap-1">
                    {deps.map((d) => (
                      <li key={d} className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{d}</li>
                    ))}
                  </ul>
                )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" /> Conflicts
              </div>
              {conflicts.length === 0
                ? <div className="text-xs text-muted-foreground">No known conflicts.</div>
                : (
                  <ul className="space-y-1">
                    {conflicts.map((c: any, i: number) => {
                      const other = c.a_key === meta.key ? c.b_key : c.a_key;
                      return (
                        <li key={`${other}-${i}`} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">
                          <span className="font-mono">{other}</span>
                          <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-300 uppercase">{c.severity}</span>
                          {c.rationale && <div className="mt-0.5 text-muted-foreground">{c.rationale}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <HistoryIcon className="h-3.5 w-3.5" /> Recent activity
              </div>
              {pendingQuery.data && pendingQuery.data.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {pendingQuery.data.map((r) => (
                    <li key={r.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-300">Pending</span>
                      <span className="ml-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                      {r.reason && <div className="mt-0.5">{r.reason}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {overridesQuery.data && overridesQuery.data.length > 0 && (
                <ul className="space-y-1">
                  {overridesQuery.data.slice(0, 8).map((o) => (
                    <li key={`${o.user_id}-${o.created_at}`} className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px]">
                      <span className="font-medium">{o.user_name}</span>{" "}
                      <span className="text-muted-foreground">— {o.mode === "grant" ? "granted" : "denied"} on {new Date(o.created_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(pendingQuery.data?.length ?? 0) === 0 && (overridesQuery.data?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground">No recent overrides or pending changes.</div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
