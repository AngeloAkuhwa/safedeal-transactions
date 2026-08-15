import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check, Minus, ShieldCheck, Users, KeyRound, ShieldAlert, Clock, History,
  Copy, RotateCcw, ExternalLink, ChevronRight,
} from "lucide-react";
import {
  INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL,
  isPrivilegedPermission, isProtectedRole,
  type InternalRoleKey,
} from "@/services/permission-catalog";
import type { PermissionEnvironment } from "@/services/permission-repository";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { useStagedPermissionChanges } from "@/hooks/useStagedPermissionChanges";
import {
  fetchRoleAssignedUsers, fetchRoleUserCounts,
  fetchPendingChangesForRole, fetchRoleLastModified, fetchRoleHistory,
} from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { PermissionToggleRow } from "./PermissionToggleRow";

function KpiCard({ icon: Icon, label, value, tone = "text-foreground" }: any) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Section({ id, title, count, defaultOpen = true, children }: {
  id: string; title: string; count?: number | string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-xl px-4 py-3 text-left hover:bg-muted/20"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {count !== undefined && (
          <span className="ml-auto rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {open && <div className="border-t border-border/60 p-4">{children}</div>}
    </section>
  );
}

export function RoleDetailPanel({
  roleMap,
  role: roleProp,
  onRoleChange,
  environment = "production",
  onCompare,
  onCloneAsTemplate,
  onResetToDefault,
  onViewHistory,
  canManage = false,
  staged,
}: {
  roleMap: RoleGrantMap;
  role?: InternalRoleKey;
  onRoleChange?: (r: InternalRoleKey) => void;
  environment?: PermissionEnvironment;
  onCompare?: (r: InternalRoleKey) => void;
  onCloneAsTemplate?: (r: InternalRoleKey) => void;
  onResetToDefault?: (r: InternalRoleKey) => void;
  onViewHistory?: (r: InternalRoleKey) => void;
  canManage?: boolean;
  staged?: ReturnType<typeof useStagedPermissionChanges>;
}) {
  const navigate = useNavigate();
  const [internal, setInternal] = useState<InternalRoleKey>(roleProp ?? "super_admin");
  const role = roleProp ?? internal;
  const bag = roleMap.map.get(role) ?? new Set<string>();
  const roleDef = INTERNAL_ROLES.find((r) => r.key === role);
  const protectedRole = isProtectedRole(role);

  const summary = useMemo(() => {
    let total = 0, granted = 0, privileged = 0, denied = 0;
    const grantedKeys: string[] = [];
    const deniedKeys: string[] = [];
    const privilegedKeys: string[] = [];
    for (const m of PERMISSION_MODULES) {
      for (const p of m.permissions) {
        total++;
        if (bag.has(p.key)) {
          granted++; grantedKeys.push(p.key);
          if (isPrivilegedPermission(p.key)) { privileged++; privilegedKeys.push(p.key); }
        } else {
          denied++; deniedKeys.push(p.key);
        }
      }
    }
    return { total, granted, privileged, denied, grantedKeys, deniedKeys, privilegedKeys };
  }, [bag]);

  const usersQuery = useQuery({
    queryKey: ["role-detail", "users", role],
    queryFn: () => fetchRoleAssignedUsers(role),
    staleTime: 30_000,
  });
  const countsQuery = useQuery({
    queryKey: ["role-detail", "user-counts"],
    queryFn: fetchRoleUserCounts,
    staleTime: 30_000,
  });
  const pendingQuery = useQuery({
    queryKey: ["role-detail", "pending", role, environment],
    queryFn: () => fetchPendingChangesForRole(role, environment),
    staleTime: 15_000,
  });
  const modifiedQuery = useQuery({
    queryKey: ["role-detail", "last-modified", role, environment],
    queryFn: () => fetchRoleLastModified(role, environment),
    staleTime: 30_000,
  });
  const historyQuery = useQuery({
    queryKey: ["role-detail", "history", role],
    queryFn: () => fetchRoleHistory(role, 20),
    staleTime: 30_000,
  });

  const activeUsers = countsQuery.data?.get(role) ?? usersQuery.data?.length ?? 0;
  const stagingEnabled = canManage && !!staged && !protectedRole;
  const superAdminCount = countsQuery.data?.get("super_admin") ?? 0;
  const derivedLevel = summary.granted === summary.total
    ? "Full access"
    : summary.privileged > 0 ? "Elevated" : summary.granted > 0 ? "Standard" : "Read-only / none";

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={role}
                onChange={(e) => {
                  const v = e.target.value as InternalRoleKey;
                  setInternal(v);
                  onRoleChange?.(v);
                }}
                className="h-10 min-w-[240px] rounded-md border border-border bg-background px-3 text-sm font-semibold relative before:absolute before:-inset-2 before:content-['']"
              >
                {INTERNAL_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>
                ))}
              </select>
              {protectedRole && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  <ShieldAlert className="h-3 w-3" /> Protected role
                </span>
              )}
              <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                {derivedLevel}
              </span>
            </div>
            {roleDef?.description && (
              <p className="mt-2 text-sm text-muted-foreground">{roleDef.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCompare?.(role)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Compare role
            </button>
            <button
              type="button"
              onClick={() => onCloneAsTemplate?.(role)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
            >
              <Copy className="h-3.5 w-3.5" /> Clone as template
            </button>
            <button
              type="button"
              disabled={protectedRole}
              onClick={() => !protectedRole && onResetToDefault?.(role)}
              title={protectedRole ? "Protected roles cannot be reset" : "Reset to default"}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40 min-h-11"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
            <button
              type="button"
              onClick={() => onViewHistory?.(role)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
            >
              <History className="h-3.5 w-3.5" /> View change history
            </button>
            <button
              type="button"
              onClick={() => navigate(`/admin/access-control?role=${role}`)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
            >
              <Users className="h-3.5 w-3.5" /> View users <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <KpiCard icon={Users} label="Active users" value={activeUsers} />
          <KpiCard icon={KeyRound} label="Granted" tone="text-emerald-400"
            value={<>{summary.granted}<span className="text-sm text-muted-foreground">/{summary.total}</span></>} />
          <KpiCard icon={ShieldAlert} label="Privileged" tone="text-amber-300" value={summary.privileged} />
          <KpiCard icon={Clock} label="Pending changes" tone={(pendingQuery.data?.length ?? 0) > 0 ? "text-amber-300" : "text-foreground"} value={pendingQuery.data?.length ?? 0} />
          <KpiCard icon={History} label="Last modified" value={modifiedQuery.data?.at ? new Date(modifiedQuery.data.at).toLocaleDateString() : "—"} />
          <KpiCard icon={ShieldCheck} label="Modified by" value={modifiedQuery.data?.by_name ?? "—"} />
        </div>
      </div>

      {/* Module access */}
      <Section id="modules" title="Module Access" count={`${PERMISSION_MODULES.length} modules`}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PERMISSION_MODULES.map((m) => {
            const has = m.permissions.filter((p) => bag.has(p.key)).length;
            const state = has === 0 ? "none" : has === m.permissions.length ? "full" : "partial";
            const tone = state === "full" ? "border-emerald-500/30 bg-emerald-500/5"
              : state === "partial" ? "border-amber-500/30 bg-amber-500/5"
              : "border-border/60 bg-background/40";
            return (
              <li key={m.key} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${tone}`}>
                <span className="truncate">{m.label}</span>
                <span className="text-xs text-muted-foreground">{has}/{m.permissions.length}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Granted permissions */}
      <Section id="granted" title="Granted Permissions" count={summary.granted}>
        {stagingEnabled ? (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.grantedKeys.length === 0 && <li className="text-xs text-muted-foreground">No granted permissions.</li>}
            {summary.grantedKeys.map((k) => (
              <PermissionToggleRow key={k} role={role} permissionKey={k} currentlyGranted
                canManage stagedOp={staged!.getStaged(role, k)}
                onToggle={staged!.stage} activeSuperAdminCount={superAdminCount} tone="granted" />
            ))}
          </ul>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.grantedKeys.length === 0 && <li className="text-xs text-muted-foreground">No granted permissions.</li>}
            {summary.grantedKeys.map((k) => {
              const label = k.split(".")[1] ?? k;
              return (
                <li key={k} className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-xs">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="truncate">{label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{k.split(".")[0]}</span>
                  {isPrivilegedPermission(k) && <PermissionRiskBadge privileged size="xs" />}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Denied permissions */}
      <Section id="denied" title="Denied Permissions" count={summary.denied} defaultOpen={false}>
        {stagingEnabled ? (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.deniedKeys.map((k) => (
              <PermissionToggleRow key={k} role={role} permissionKey={k} currentlyGranted={false}
                canManage stagedOp={staged!.getStaged(role, k)}
                onToggle={staged!.stage} activeSuperAdminCount={superAdminCount} tone="denied" />
            ))}
          </ul>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.deniedKeys.map((k) => (
              <li key={k} className="flex items-center gap-2 rounded-md border border-border bg-background/30 px-2 py-1.5 text-xs text-muted-foreground">
                <Minus className="h-3.5 w-3.5" />
                <span className="truncate">{k.split(".")[1]}</span>
                <span className="ml-auto font-mono text-[10px]">{k.split(".")[0]}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Privileged permissions */}
      <Section id="privileged" title="Privileged Permissions" count={summary.privileged}>
        {summary.privilegedKeys.length === 0
          ? <div className="text-xs text-muted-foreground">This role holds no privileged permissions.</div>
          : stagingEnabled ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {summary.privilegedKeys.map((k) => (
                <PermissionToggleRow key={k} role={role} permissionKey={k} currentlyGranted
                  canManage stagedOp={staged!.getStaged(role, k)}
                  onToggle={staged!.stage} activeSuperAdminCount={superAdminCount} tone="privileged" />
              ))}
            </ul>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {summary.privilegedKeys.map((k) => (
                <li key={k} className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
                  <span className="truncate">{k}</span>
                  <PermissionRiskBadge privileged size="xs" />
                </li>
              ))}
            </ul>
          )}
      </Section>

      {/* Users */}
      <Section id="users" title="Users with this Role" count={activeUsers}>
        {usersQuery.isLoading && <div className="text-xs text-muted-foreground">Loading users…</div>}
        {usersQuery.data && usersQuery.data.length === 0 && <div className="text-xs text-muted-foreground">No users assigned.</div>}
        {usersQuery.data && usersQuery.data.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {usersQuery.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
                {u.is_primary && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">Primary</span>}
                {u.status && u.status !== "active" && (
                  <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{u.status}</span>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/admin/users/${u.id}/profile`)}
                  className="text-xs text-primary hover:underline min-h-11 inline-flex items-center"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Pending changes */}
      <Section id="pending" title="Pending Changes" count={pendingQuery.data?.length ?? 0} defaultOpen={(pendingQuery.data?.length ?? 0) > 0}>
        {(pendingQuery.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">No pending changes for this role.</div>}
        <ul className="space-y-2">
          {(pendingQuery.data ?? []).map((r) => (
            <li key={r.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">Pending</span>
              </div>
              {r.reason && <div className="mt-1 text-foreground">{r.reason}</div>}
              <div className="mt-1 text-muted-foreground">
                +{Math.max(0, r.after_keys.length - r.before_keys.length)} added
                {" · "}
                -{Math.max(0, r.before_keys.length - r.after_keys.length)} removed
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Change history */}
      <Section id="history" title="Change History" count={historyQuery.data?.length ?? 0} defaultOpen={false}>
        {(historyQuery.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">No recent activity.</div>}
        <ul className="space-y-2">
          {(historyQuery.data ?? []).map((h) => (
            <li key={h.id} className="rounded-md border border-border/60 bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{new Date(h.created_at).toLocaleString()}</span>
                <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5">{h.action_type}</span>
              </div>
              {h.actor_name && <div className="mt-1 text-foreground">{h.actor_name}</div>}
              {h.summary && <div className="mt-1 text-muted-foreground line-clamp-2">{h.summary}</div>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
