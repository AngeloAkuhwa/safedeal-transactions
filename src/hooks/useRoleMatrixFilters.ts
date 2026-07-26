import { useCallback, useMemo, useState } from "react";
import type { PermissionRiskLevel, PermissionRowState, InternalRoleKey } from "@/services/permission-catalog";
import { INTERNAL_ROLES } from "@/services/permission-catalog";

export type RoleMatrixMode = "all" | "compare";

export interface RoleMatrixFilters {
  mode: RoleMatrixMode;
  search: string;
  modules: string[];              // [] = all
  risks: PermissionRiskLevel[];   // [] = all
  states: PermissionRowState[];   // [] = all
  visibleRoles: InternalRoleKey[];
  compareRoles: InternalRoleKey[];
  privilegedOnly: boolean;
  differencesOnly: boolean;
  expandedModules: Set<string>;
  allExpanded: boolean;
}

const DEFAULT: RoleMatrixFilters = {
  mode: "all",
  search: "",
  modules: [],
  risks: [],
  states: [],
  visibleRoles: INTERNAL_ROLES.map((r) => r.key),
  compareRoles: [INTERNAL_ROLES[0].key, INTERNAL_ROLES[1].key],
  privilegedOnly: false,
  differencesOnly: false,
  expandedModules: new Set(),
  allExpanded: true,
};

export function useRoleMatrixFilters() {
  const [state, setState] = useState<RoleMatrixFilters>(DEFAULT);

  const set = useCallback(<K extends keyof RoleMatrixFilters>(key: K, value: RoleMatrixFilters[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const toggleModule = useCallback((moduleKey: string) => {
    setState((s) => {
      const next = new Set(s.expandedModules);
      if (s.allExpanded) {
        // First manual toggle: seed set with everything expanded then flip target.
        // Simpler: switch to explicit mode with target collapsed.
        return { ...s, allExpanded: false, expandedModules: new Set(), };
      }
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return { ...s, expandedModules: next };
    });
  }, []);

  const expandAll = useCallback(() => setState((s) => ({ ...s, allExpanded: true, expandedModules: new Set() })), []);
  const collapseAll = useCallback(() => setState((s) => ({ ...s, allExpanded: false, expandedModules: new Set() })), []);

  const reset = useCallback(() => {
    setState((s) => ({ ...DEFAULT, visibleRoles: s.visibleRoles, compareRoles: s.compareRoles, mode: s.mode }));
  }, []);

  const isModuleExpanded = useCallback((moduleKey: string) => {
    return state.allExpanded ? true : state.expandedModules.has(moduleKey);
  }, [state.allExpanded, state.expandedModules]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.search.trim()) n++;
    if (state.modules.length) n++;
    if (state.risks.length) n++;
    if (state.states.length) n++;
    if (state.privilegedOnly) n++;
    if (state.differencesOnly) n++;
    if (state.visibleRoles.length !== INTERNAL_ROLES.length) n++;
    return n;
  }, [state]);

  return { state, set, toggleModule, expandAll, collapseAll, reset, isModuleExpanded, activeFilterCount };
}