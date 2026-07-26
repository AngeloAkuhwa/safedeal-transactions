import { useMemo } from "react";
import { Check, X, AlertTriangle, ShieldAlert, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  getPermissionRisk,
  isPrivilegedPermission,
  isProtectedRole,
  type InternalRoleKey,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { computeRoleDiff, computeMissingDependencies, computeConflicts } from "@/services/permission-dependencies";
import type { RoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";
import type { StagedOp } from "@/hooks/useStagedPermissionChanges";

interface Props {
  roleMap: RoleGrantMap;
  filters: RoleMatrixFilters;
  canWrite: boolean;
  onSetCompareRoles: (roles: InternalRoleKey[]) => void;
  onStageMany: (role: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => void;
}

function permLabel(key: string) {
  for (const m of PERMISSION_MODULES) {
    const p = m.permissions.find((x) => x.key === key);
    if (p) return { label: p.label, module: m.label };
  }
  return { label: key, module: "—" };
}

function riskChip(key: string) {
  const r = getPermissionRisk(key);
  const map = {
    critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    medium: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    low: "border-border/60 bg-muted/40 text-muted-foreground",
  } as const;
  return <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase", map[r])}>{r}</span>;
}

export function CompareRolesMatrix({ roleMap, filters, canWrite, onSetCompareRoles, onStageMany }: Props) {
  const selected = filters.compareRoles;
  const canAdd = selected.length < 4;
  const canRemove = selected.length > 2;

  const q = filters.search.trim().toLowerCase();
  const filterKey = (k: string): boolean => {
    if (filters.risks.length && !filters.risks.includes(getPermissionRisk(k))) return false;
    if (filters.privilegedOnly && !isPrivilegedPermission(k)) return false;
    if (filters.modules.length) {
      const mod = PERMISSION_MODULES.find((m) => m.permissions.some((p) => p.key === k));
      if (!mod || !filters.modules.includes(mod.key)) return false;
    }
    if (q) {
      const meta = permLabel(k);
      if (!(`${meta.label} ${k}`.toLowerCase()).includes(q)) return false;
    }
    return true;
  };

  const diff = useMemo(() => computeRoleDiff(selected, roleMap.map), [selected, roleMap]);
  const sharedFiltered = diff.shared.filter(filterKey);
  const differingFiltered = diff.differing.filter(filterKey);
  const privilegedDiffs = differingFiltered.filter(isPrivilegedPermission);

  const perRoleAnalysis = selected.map((role) => {
    const bag = roleMap.map.get(role) ?? new Set<string>();
    return {
      role,
      missing: computeMissingDependencies(bag),
      conflicts: computeConflicts(bag),
    };
  });

  const copyFrom = (source: InternalRoleKey, target: InternalRoleKey) => {
    if (!canWrite || isProtectedRole(target)) return;
    const src = roleMap.map.get(source) ?? new Set<string>();
    const tgt = roleMap.map.get(target) ?? new Set<string>();
    const changes: Array<{ permissionKey: string; op: StagedOp }> = [];
    for (const k of src) if (!tgt.has(k)) changes.push({ permissionKey: k, op: "grant" });
    for (const k of tgt) if (!src.has(k)) changes.push({ permissionKey: k, op: "revoke" });
    if (!changes.length) return;
    if (!confirm(`Copy ${ROLE_LABEL[source]} permissions to ${ROLE_LABEL[target]}?\n\n${changes.length} change(s) will be staged for review.`)) return;
    onStageMany(target, changes);
  };

  return (
    <div className="space-y-4">
      {/* Role picker */}
      <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <GitCompare className="h-4 w-4 text-primary" /> Compare 2–4 roles
        </div>
        <div className="flex flex-wrap gap-2">
          {INTERNAL_ROLES.map((r) => {
            const on = selected.includes(r.key);
            const disabled = (on && !canRemove) || (!on && !canAdd);
            return (
              <button
                key={r.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = on ? selected.filter((k) => k !== r.key) : [...selected, r.key];
                  onSetCompareRoles(next);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  on
                    ? "border-primary/50 bg-primary/15 text-primary-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                  disabled && "opacity-40",
                )}
              >
                {ROLE_LABEL[r.key]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side-by-side header + copy actions */}
      {canWrite && selected.length >= 2 && (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Copy permissions
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {selected.map((source) => selected
              .filter((t) => t !== source && !isProtectedRole(t))
              .map((target) => (
                <button
                  key={`${source}->${target}`}
                  type="button"
                  onClick={() => copyFrom(source, target)}
                  className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1 hover:border-primary/40 hover:text-foreground"
                >
                  {ROLE_LABEL[source]} → {ROLE_LABEL[target]}
                </button>
              )))}
          </div>
        </div>
      )}

      {/* Privileged differences */}
      <Section title="Privileged permission differences" count={privilegedDiffs.length} tone="danger">
        {privilegedDiffs.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No privileged permission differences.</div>
        ) : (
          <DiffTable keys={privilegedDiffs} selected={selected} roleMap={roleMap} />
        )}
      </Section>

      {/* Unique per role */}
      {selected.map((role) => {
        const unique = (diff.uniqueByRole.get(role) ?? []).filter(filterKey);
        return (
          <Section key={role} title={`Unique to ${ROLE_LABEL[role]}`} count={unique.length}>
            {unique.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">None.</div>
            ) : (
              <ul className="p-2">
                {unique.map((k) => (
                  <li key={k} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40">
                    {riskChip(k)}
                    <span className="font-medium">{permLabel(k).label}</span>
                    <code className="ml-auto text-[10px] text-muted-foreground">{k}</code>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {/* Missing dependencies + conflicts */}
      <Section title="Missing dependencies" count={perRoleAnalysis.reduce((n, x) => n + x.missing.length, 0)} tone="warn">
        {perRoleAnalysis.every((x) => x.missing.length === 0) ? (
          <div className="p-3 text-xs text-muted-foreground">All required dependencies are satisfied.</div>
        ) : (
          <div className="space-y-3 p-2">
            {perRoleAnalysis.filter((x) => x.missing.length > 0).map((x) => (
              <div key={x.role}>
                <div className="text-xs font-semibold text-foreground/90">{ROLE_LABEL[x.role]}</div>
                <ul className="mt-1 space-y-1">
                  {x.missing.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-amber-200">
                      <AlertTriangle className="h-3 w-3" />
                      <code>{m.have}</code> needs <code>{m.needs}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Conflicting financial responsibilities" count={perRoleAnalysis.reduce((n, x) => n + x.conflicts.length, 0)} tone="danger">
        {perRoleAnalysis.every((x) => x.conflicts.length === 0) ? (
          <div className="p-3 text-xs text-muted-foreground">No segregation-of-duties conflicts detected.</div>
        ) : (
          <div className="space-y-3 p-2">
            {perRoleAnalysis.filter((x) => x.conflicts.length > 0).map((x) => (
              <div key={x.role}>
                <div className="text-xs font-semibold text-foreground/90">{ROLE_LABEL[x.role]}</div>
                <ul className="mt-1 space-y-1">
                  {x.conflicts.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-rose-300">
                      <ShieldAlert className="h-3 w-3" />
                      <code>{c.a}</code> conflicts with <code>{c.b}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Shared */}
      <Section title="Shared by all selected roles" count={sharedFiltered.length} collapsedByDefault>
        {sharedFiltered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No shared permissions.</div>
        ) : (
          <ul className="grid grid-cols-1 gap-1 p-2 md:grid-cols-2 lg:grid-cols-3">
            {sharedFiltered.map((k) => (
              <li key={k} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40">
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="truncate">{permLabel(k).label}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title, count, children, tone, collapsedByDefault,
}: {
  title: string; count: number; children: React.ReactNode;
  tone?: "warn" | "danger"; collapsedByDefault?: boolean;
}) {
  return (
    <details open={!collapsedByDefault} className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm">
      <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-muted/20">
        {tone === "danger" && <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />}
        {tone === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
        {title}
        <span className="rounded-full bg-muted/60 px-2 text-[10px] font-medium text-muted-foreground">{count}</span>
      </summary>
      <div className="border-t border-border/40">{children}</div>
    </details>
  );
}

function DiffTable({ keys, selected, roleMap }: { keys: string[]; selected: InternalRoleKey[]; roleMap: RoleGrantMap }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left">Permission</th>
            {selected.map((r) => <th key={r} className="px-2 py-2 text-center">{ROLE_LABEL[r]}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="hover:bg-muted/20">
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  {riskChip(k)}
                  <span className="text-xs">{permLabel(k).label}</span>
                </div>
                <code className="text-[10px] text-muted-foreground">{k}</code>
              </td>
              {selected.map((r) => {
                const held = roleMap.map.get(r)?.has(k) ?? false;
                return (
                  <td key={r} className="px-2 py-1.5 text-center">
                    {held
                      ? <Check className="mx-auto h-3.5 w-3.5 text-emerald-400" />
                      : <X className="mx-auto h-3 w-3 text-muted-foreground/60" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}