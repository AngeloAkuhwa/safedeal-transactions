import { useMemo } from "react";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  getPermissionRisk,
  isPrivilegedPermission,
  type PermissionRowState,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { PermissionRowStateBadge } from "./PermissionRowStateBadge";
import type { FiltersState } from "./PermissionFilters";
import { EmptyState } from "./EmptyState";

export function FeatureRegistryTable({
  roleMap,
  filters,
  overrideCountByPerm,
  onRowClick,
}: {
  roleMap: RoleGrantMap;
  filters: FiltersState;
  overrideCountByPerm: Map<string, number>;
  onRowClick?: (permissionKey: string) => void;
}) {
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const out: Array<{
      key: string; label: string; module: string; moduleKey: string;
      privileged: boolean; risk: ReturnType<typeof getPermissionRisk>;
      state: PermissionRowState;
      grantedRoles: string[]; overrideCount: number;
    }> = [];
    for (const m of PERMISSION_MODULES) {
      if (filters.module !== "all" && m.key !== filters.module) continue;
      for (const p of m.permissions) {
        const risk = getPermissionRisk(p.key);
        const priv = isPrivilegedPermission(p.key);
        if (filters.risk === "privileged" && !priv) continue;
        if (filters.risk === "standard" && priv) continue;
        if (q && !p.label.toLowerCase().includes(q) && !p.key.toLowerCase().includes(q) && !m.label.toLowerCase().includes(q)) continue;
        const grantedRoles = INTERNAL_ROLES
          .filter((r) => filters.role === "all" || r.key === filters.role)
          .filter((r) => roleMap.map.get(r.key)?.has(p.key))
          .map((r) => ROLE_LABEL[r.key]);
        const overrideCount = overrideCountByPerm.get(p.key) ?? 0;
        // Derive a coarse row-state for the registry table.
        // Fine-grained per-user state is shown in the User Overrides table.
        const state: PermissionRowState = overrideCount > 0
          ? "override_granted"
          : grantedRoles.length > 0
            ? "granted"
            : risk === "critical"
              ? "restricted"
              : "denied";
        out.push({
          key: p.key,
          label: p.label,
          module: m.label,
          moduleKey: m.key,
          privileged: priv,
          risk,
          state,
          grantedRoles,
          overrideCount,
        });
      }
    }
    return out;
  }, [roleMap, filters, overrideCountByPerm]);

  if (!rows.length) return <EmptyState title="No permissions match" description="Adjust filters to see more results." />;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Permission</th>
              <th className="px-4 py-2 text-left font-medium">Module</th>
              <th className="px-4 py-2 text-left font-medium">Risk</th>
              <th className="px-4 py-2 text-left font-medium">State</th>
              <th className="px-4 py-2 text-left font-medium">Granted To</th>
              <th className="px-4 py-2 text-right font-medium">Overrides</th>
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
                </td>
                <td className="px-4 py-3 align-middle text-sm text-muted-foreground">{r.module}</td>
                <td className="px-4 py-3 align-middle"><PermissionRiskBadge risk={r.risk} /></td>
                <td className="px-4 py-3 align-middle"><PermissionRowStateBadge state={r.state} /></td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                  {r.grantedRoles.length ? r.grantedRoles.slice(0, 3).join(", ") + (r.grantedRoles.length > 3 ? ` +${r.grantedRoles.length - 3}` : "") : <span className="italic">No roles</span>}
                </td>
                <td className="px-4 py-3 align-middle text-right font-mono text-xs">{r.overrideCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
