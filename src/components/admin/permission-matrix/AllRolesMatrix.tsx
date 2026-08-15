import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Minus, AlertTriangle, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  getPermissionRisk,
  isPrivilegedPermission,
  isProtectedRole,
  type InternalRoleKey,
  type PermissionRowState,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { RoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";
import type { StagedOp } from "@/hooks/useStagedPermissionChanges";

interface Props {
  roleMap: RoleGrantMap;
  filters: RoleMatrixFilters;
  canWrite: boolean;
  isModuleExpanded: (moduleKey: string) => boolean;
  toggleModule: (moduleKey: string) => void;
  getStaged: (role: InternalRoleKey, permissionKey: string) => StagedOp | undefined;
  onStage: (role: InternalRoleKey, permissionKey: string, currentlyGranted: boolean) => void;
  onStageMany: (role: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => void;
}

function riskBadge(key: string) {
  const r = getPermissionRisk(key);
  if (r === "critical") return <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[12px] font-bold uppercase text-rose-300">Critical</span>;
  if (r === "high") return <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-bold uppercase text-amber-300">High</span>;
  return null;
}

export function AllRolesMatrix({
  roleMap, filters, canWrite, isModuleExpanded, toggleModule, getStaged, onStage, onStageMany,
}: Props) {
  const roles = INTERNAL_ROLES.filter((r) => filters.visibleRoles.includes(r.key));
  const q = filters.search.trim().toLowerCase();

  const visibleModules = useMemo(() => {
    return PERMISSION_MODULES
      .filter((m) => filters.modules.length === 0 || filters.modules.includes(m.key))
      .map((m) => {
        const perms = m.permissions.filter((p) => {
          if (filters.risks.length && !filters.risks.includes(getPermissionRisk(p.key))) return false;
          if (filters.privilegedOnly && !isPrivilegedPermission(p.key)) return false;
          if (q) {
            const hay = `${p.label} ${p.key}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          if (filters.differencesOnly) {
            const holders = roles.filter((r) => roleMap.map.get(r.key)?.has(p.key)).length;
            if (holders === 0 || holders === roles.length) return false;
          }
          if (filters.states.length) {
            const anyMatch = roles.some((r) => {
              const held = roleMap.map.get(r.key)?.has(p.key);
              const state: PermissionRowState = held ? "granted" : "denied";
              return filters.states.includes(state);
            });
            if (!anyMatch) return false;
          }
          return true;
        });
        return { ...m, permissions: perms };
      })
      .filter((m) => m.permissions.length > 0);
  }, [roles, roleMap, filters, q]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm md:p-3">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[800px] border-separate border-spacing-0 text-sm sd-stack">
          <thead>
            <tr className="text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 top-0 z-20 min-w-[300px] bg-card/95 px-4 py-2.5 text-left font-semibold backdrop-blur">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.key} className="sticky top-0 z-10 bg-card/95 px-2 py-2.5 text-center font-semibold backdrop-blur">
                  <div className="mx-auto max-w-[120px] text-balance text-[12px] leading-tight">{ROLE_LABEL[r.key]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModules.length === 0 && (
              <tr>
                <td colSpan={roles.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No permissions match the current filters.
                </td>
              </tr>
            )}
            {visibleModules.map((mod) => {
              const expanded = isModuleExpanded(mod.key);
              return (
                <ModuleGroup
                  key={mod.key}
                  mod={mod}
                  roles={roles}
                  roleMap={roleMap}
                  expanded={expanded}
                  onToggle={() => toggleModule(mod.key)}
                  canWrite={canWrite}
                  getStaged={getStaged}
                  onStage={onStage}
                  onStageMany={onStageMany}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleGroup({
  mod, roles, roleMap, expanded, onToggle, canWrite, getStaged, onStage, onStageMany,
}: {
  mod: typeof PERMISSION_MODULES[number];
  roles: typeof INTERNAL_ROLES;
  roleMap: RoleGrantMap;
  expanded: boolean;
  onToggle: () => void;
  canWrite: boolean;
  getStaged: (role: InternalRoleKey, permissionKey: string) => StagedOp | undefined;
  onStage: (role: InternalRoleKey, permissionKey: string, currentlyGranted: boolean) => void;
  onStageMany: (role: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => void;
}) {
  const [menuRole, setMenuRole] = useState<InternalRoleKey | null>(null);

  const bulkGrant = (role: InternalRoleKey) => {
    const bag = roleMap.map.get(role) ?? new Set<string>();
    const changes = mod.permissions
      .filter((p) => !bag.has(p.key))
      .map((p) => ({ permissionKey: p.key, op: "grant" as StagedOp }));
    if (changes.length) onStageMany(role, changes);
    setMenuRole(null);
  };
  const bulkRevoke = (role: InternalRoleKey) => {
    const bag = roleMap.map.get(role) ?? new Set<string>();
    const changes = mod.permissions
      .filter((p) => bag.has(p.key))
      .map((p) => ({ permissionKey: p.key, op: "revoke" as StagedOp }));
    if (changes.length) onStageMany(role, changes);
    setMenuRole(null);
  };

  return (
    <>
      <tr className="group">
        <td
          colSpan={roles.length + 1}
          className="sticky left-0 z-[5] bg-muted/30 px-3 py-2 backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm font-semibold hover:bg-muted min-h-11"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {mod.label}
            </button>
            <span className="text-[12px] text-muted-foreground">{mod.permissions.length} permissions</span>
            <div className="ml-auto flex items-center gap-1">
              {roles.map((r) => {
                const bag = roleMap.map.get(r.key) ?? new Set<string>();
                const granted = mod.permissions.filter((p) => bag.has(p.key)).length;
                const total = mod.permissions.length;
                const cls = granted === total ? "bg-emerald-500/20 text-emerald-300"
                  : granted === 0 ? "bg-muted-foreground/15 text-muted-foreground"
                  : "bg-amber-500/20 text-amber-200";
                const isProtected = isProtectedRole(r.key);
                return (
                  <div key={r.key} className="relative">
                    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[12px] font-semibold", cls)}
                      title={`${ROLE_LABEL[r.key]}: ${granted}/${total}`}
                    >
                      {granted}/{total}
                    </span>
                    {canWrite && !isProtected && (
                      <button
                        type="button"
                        onClick={() => setMenuRole(menuRole === r.key ? null : r.key)}
                        className="ml-0.5 inline-flex h-11 w-11 items-center justify-center rounded hover:bg-muted"
                        title="Bulk actions"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                    )}
                    {menuRole === r.key && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuRole(null)} />
                        <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-xl">
                          <button type="button" onClick={() => bulkGrant(r.key)} className="block min-h-11 w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                            Grant all in module
                          </button>
                          <button type="button" onClick={() => bulkRevoke(r.key)} className="block min-h-11 w-full rounded px-2 py-1.5 text-left text-xs text-rose-300 hover:bg-muted">
                            Revoke all in module
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </td>
      </tr>

      {expanded && mod.permissions.map((p) => (
        <tr key={p.key} className="group hover:bg-primary/[0.04]">
          <td className="sticky left-0 z-[3] min-w-[300px] bg-background/70 px-4 py-2 backdrop-blur">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-[13px] font-medium text-foreground/90">
                  {p.label}
                  {riskBadge(p.key)}
                </div>
                <code className="mt-0.5 block truncate text-[12px] text-muted-foreground">{p.key}</code>
              </div>
            </div>
          </td>
          {roles.map((r) => {
            const held = roleMap.map.get(r.key)?.has(p.key) ?? false;
            const staged = getStaged(r.key, p.key);
            const effectiveGranted = staged ? staged === "grant" : held;
            const editable = canWrite && !isProtectedRole(r.key);
            return (
              <td key={r.key} className="px-2 py-2 text-center align-middle">
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => onStage(r.key, p.key, held)}
                  title={editable ? "Click to stage change" : isProtectedRole(r.key) ? "Protected role — cannot edit" : "Read-only"}
                  className={cn(
                    "inline-flex h-11 w-9 items-center justify-center rounded-full transition",
                    effectiveGranted
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-muted/40 text-muted-foreground",
                    staged && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                    editable && "cursor-pointer hover:brightness-125",
                    !editable && "cursor-not-allowed opacity-70",
                  )}
                >
                  {effectiveGranted ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3 w-3" />}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// Re-export just so importers can grab AlertTriangle from a single place if needed later.
export const _Icons = { AlertTriangle };