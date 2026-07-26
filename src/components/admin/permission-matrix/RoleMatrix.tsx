import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { Shield, ShieldCheck, Gavel, Scale, LifeBuoy, BadgeCheck, Wallet, Landmark, FileSearch, Eye } from "lucide-react";
import { computeCell, type RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionStateCell } from "./PermissionStateCell";
import type { FiltersState } from "./PermissionFilters";

const ROLE_ICON: Record<InternalRoleKey, typeof Shield> = {
  super_admin: ShieldCheck,
  senior_admin: Shield,
  dispute_manager: Gavel,
  dispute_agent: Scale,
  support_agent: LifeBuoy,
  identity_officer: BadgeCheck,
  finance_operator: Wallet,
  finance_approver: Landmark,
  compliance_officer: FileSearch,
  auditor: Eye,
};

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
    <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Permission Matrix</h3>
          <p className="text-xs text-muted-foreground">Feature-by-role grant summary from the role_permissions table.</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
          <Shield className="h-3 w-3" /> Changes require approval &amp; audit trail
        </div>
      </header>
      <div className="relative overflow-x-auto">
        <div className="pointer-events-none absolute inset-y-0 left-[220px] z-[5] w-6 bg-gradient-to-r from-card/80 to-transparent" aria-hidden />
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[220px] bg-muted/40 px-4 py-2.5 text-left font-semibold">Feature / Module</th>
              {roles.map((r) => (
                <th key={r.key} className="px-3 py-2.5 text-center font-semibold">
                  <div className="mx-auto flex max-w-[140px] items-center justify-center gap-1.5 text-balance leading-tight">
                    {(() => {
                      const Icon = ROLE_ICON[r.key] ?? Shield;
                      return <Icon className="h-3 w-3 shrink-0 text-primary/70" />;
                    })()}
                    <span>{ROLE_LABEL[r.key]}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModules.map((mod, idx) => (
              <tr
                key={mod.key}
                className={`group border-b border-border/40 transition last:border-0 hover:bg-primary/[0.03] ${idx % 2 === 1 ? "bg-muted/[0.04]" : ""}`}
              >
                <td className="sticky left-0 z-10 min-w-[220px] bg-card/95 px-4 py-2.5 text-foreground/90 group-hover:bg-card">
                  <div className="text-[13px] font-semibold leading-tight">{mod.label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{mod.permissions.length} permissions</div>
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
