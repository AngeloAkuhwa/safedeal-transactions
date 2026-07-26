import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { computeCell, type RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionStateCell } from "./PermissionStateCell";
import type { FiltersState } from "./PermissionFilters";

export function RoleMatrix({
  roleMap,
  filters,
  onCellClick,
}: {
  roleMap: RoleGrantMap;
  filters: FiltersState;
  onCellClick?: (role: InternalRoleKey, moduleKey: string) => void;
}) {
  const roles = filters.role === "all"
    ? INTERNAL_ROLES
    : INTERNAL_ROLES.filter((r) => r.key === filters.role);
  const modules = filters.module === "all"
    ? PERMISSION_MODULES
    : PERMISSION_MODULES.filter((m) => m.key === filters.module);
  const q = filters.search.trim().toLowerCase();
  const visibleModules = modules.filter((m) => {
    if (!q) return true;
    if (m.label.toLowerCase().includes(q)) return true;
    return m.permissions.some((p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
  });

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Permission Matrix</h3>
          <p className="text-xs text-muted-foreground">Feature-by-role grant summary from the role_permissions table.</p>
        </div>
        <div className="text-xs text-amber-400">Changes require approval &amp; audit trail</div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[220px] bg-muted/40 px-4 py-2 text-left font-medium">Feature / Module</th>
              {roles.map((r) => (
                <th key={r.key} className="px-3 py-2 text-center font-medium">
                  <div className="whitespace-nowrap">{ROLE_LABEL[r.key]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModules.map((mod) => (
              <tr key={mod.key} className="border-b border-border/60 last:border-0">
                <td className="sticky left-0 z-10 min-w-[220px] bg-card px-4 py-2 text-foreground/90">
                  <div className="text-sm font-medium">{mod.label}</div>
                  <div className="text-[11px] text-muted-foreground">{mod.permissions.length} permissions</div>
                </td>
                {roles.map((r) => {
                  const info = computeCell(roleMap, r.key, mod.key);
                  return (
                    <td key={r.key} className="px-2 py-2 text-center">
                      <PermissionStateCell
                        state={info.state}
                        granted={info.granted}
                        total={info.total}
                        onClick={onCellClick ? () => onCellClick(r.key, mod.key) : undefined}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
