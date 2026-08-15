import { useMemo } from "react";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  getPermissionRisk,
  isPrivilegedPermission,
  findPermissionEntry,
} from "@/services/permission-catalog";
import type { PermissionEnvironment } from "@/services/permission-repository";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import type { FiltersState } from "./PermissionFilters";
import { EmptyState } from "./EmptyState";

function StatusPill({ status }: { status: "active" | "suspended" | "deprecated" }) {
  const map = {
    active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    suspended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    deprecated: "border-border bg-muted/40 text-muted-foreground line-through",
  } as const;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${map[status]}`}>{status}</span>;
}

export function FeatureRegistryTable({
  roleMap,
  filters,
  overrideCountByPerm,
  environmentMap,
  currentEnvironment,
  onRowClick,
}: {
  roleMap: RoleGrantMap;
  filters: FiltersState;
  overrideCountByPerm: Map<string, number>;
  environmentMap?: Map<string, PermissionEnvironment[]>;
  currentEnvironment?: PermissionEnvironment;
  onRowClick?: (permissionKey: string) => void;
}) {
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const out: Array<{
      key: string; label: string; description?: string;
      module: string; moduleKey: string; action: string;
      privileged: boolean; risk: ReturnType<typeof getPermissionRisk>;
      status: "active" | "suspended" | "deprecated";
      approval_required: boolean;
      owner_role: string | null;
      environments: PermissionEnvironment[];
      grantedRoles: string[]; overrideCount: number;
      updated_at?: string;
    }> = [];
    for (const m of PERMISSION_MODULES) {
      if (filters.module !== "all" && m.key !== filters.module) continue;
      for (const p of m.permissions) {
        const risk = getPermissionRisk(p.key);
        const priv = isPrivilegedPermission(p.key);
        if (filters.risk === "privileged" && !priv) continue;
        if (filters.risk === "standard" && priv) continue;
        if (filters.action && filters.action !== "all" && p.action !== filters.action) continue;
        const status = (p.status ?? "active");
        if (filters.status && filters.status !== "all" && status !== filters.status) continue;
        const approval = !!p.approval_required;
        if (filters.approval === "required" && !approval) continue;
        if (filters.approval === "not_required" && approval) continue;
        const envs = environmentMap?.get(p.key) ?? (["production","staging","development"] as PermissionEnvironment[]);
        if (currentEnvironment && !envs.includes(currentEnvironment)) continue;
        if (q) {
          const hay = `${p.label} ${p.key} ${m.label} ${p.description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const grantedRoles = INTERNAL_ROLES
          .filter((r) => filters.role === "all" || r.key === filters.role)
          .filter((r) => roleMap.map.get(r.key)?.has(p.key))
          .map((r) => ROLE_LABEL[r.key]);
        const overrideCount = overrideCountByPerm.get(p.key) ?? 0;
        out.push({
          key: p.key,
          label: p.label,
          description: p.description,
          module: m.label,
          moduleKey: m.key,
          action: p.action,
          privileged: priv,
          risk,
          status,
          approval_required: approval,
          owner_role: p.owner_role ?? null,
          environments: envs,
          grantedRoles,
          overrideCount,
          updated_at: p.updated_at,
        });
      }
    }
    return out;
  }, [roleMap, filters, overrideCountByPerm, environmentMap, currentEnvironment]);

  if (!rows.length) return <EmptyState title="No permissions match" description="Adjust filters to see more results." />;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-y-1 text-sm sd-stack">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Permission</th>
              <th className="px-4 py-2 text-left font-medium">Module</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Risk</th>
              <th className="px-4 py-2 text-left font-medium">Approval</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Environments</th>
              <th className="px-4 py-2 text-left font-medium">Owner</th>
              <th className="px-4 py-2 text-right font-medium">Roles</th>
              <th className="px-4 py-2 text-right font-medium">Overrides</th>
              <th className="px-4 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="cursor-pointer transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
                onClick={() => onRowClick?.(r.key)}
              >
                <td className="px-4 py-3 align-middle">
                  <div className="text-sm font-medium text-foreground">{r.label.split("—")[1]?.trim() ?? r.label}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{r.key}</div>
                  {r.description && <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{r.description}</div>}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-muted-foreground">{r.module}</td>
                <td className="px-4 py-3 align-middle text-xs font-mono text-muted-foreground">{r.action}</td>
                <td className="px-4 py-3 align-middle"><PermissionRiskBadge risk={r.risk} /></td>
                <td className="px-4 py-3 align-middle text-xs">
                  {r.approval_required
                    ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">Required</span>
                    : <span className="text-muted-foreground">Direct</span>}
                </td>
                <td className="px-4 py-3 align-middle"><StatusPill status={r.status} /></td>
                <td className="px-4 py-3 align-middle text-[11px] text-muted-foreground">
                  {r.environments.map((e) => e[0].toUpperCase() + e.slice(1, 4)).join(" · ")}
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                  {r.owner_role ? (ROLE_LABEL[r.owner_role as keyof typeof ROLE_LABEL] ?? r.owner_role) : <span className="italic">—</span>}
                </td>
                <td className="px-4 py-3 align-middle text-right text-xs text-muted-foreground">
                  {r.grantedRoles.length ? r.grantedRoles.slice(0, 3).join(", ") + (r.grantedRoles.length > 3 ? ` +${r.grantedRoles.length - 3}` : "") : <span className="italic">No roles</span>}
                </td>
                <td className="px-4 py-3 align-middle text-right font-mono text-xs">{r.overrideCount}</td>
                <td className="px-4 py-3 align-middle text-[11px] text-muted-foreground">
                  {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Re-export helper so drawer callers can look up a permission entry consistently.
export { findPermissionEntry };
