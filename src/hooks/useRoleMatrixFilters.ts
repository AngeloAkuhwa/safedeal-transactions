import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

const URL_PREFIX = "rm_"; // scope so we don't collide with other tabs' params
const ALL_ROLE_KEYS = INTERNAL_ROLES.map((r) => r.key);

function readFromParams(params: URLSearchParams): Partial<RoleMatrixFilters> {
  const out: Partial<RoleMatrixFilters> = {};
  const mode = params.get(`${URL_PREFIX}mode`);
  if (mode === "all" || mode === "compare") out.mode = mode;
  const q = params.get(`${URL_PREFIX}q`);
  if (q != null) out.search = q;
  const mods = params.get(`${URL_PREFIX}mods`);
  if (mods) out.modules = mods.split(",").filter(Boolean);
  const risks = params.get(`${URL_PREFIX}risk`);
  if (risks) out.risks = risks.split(",").filter(Boolean) as PermissionRiskLevel[];
  const states = params.get(`${URL_PREFIX}state`);
  if (states) out.states = states.split(",").filter(Boolean) as PermissionRowState[];
  const roles = params.get(`${URL_PREFIX}roles`);
  if (roles) {
    const parsed = roles.split(",").filter(Boolean) as InternalRoleKey[];
    if (parsed.length) out.visibleRoles = parsed;
  }
  const cmp = params.get(`${URL_PREFIX}cmp`);
  if (cmp) {
    const parsed = cmp.split(",").filter(Boolean) as InternalRoleKey[];
    if (parsed.length >= 2 && parsed.length <= 4) out.compareRoles = parsed;
  }
  if (params.get(`${URL_PREFIX}priv`) === "1") out.privilegedOnly = true;
  if (params.get(`${URL_PREFIX}diff`) === "1") out.differencesOnly = true;
  return out;
}

function writeToParams(prev: URLSearchParams, s: RoleMatrixFilters): URLSearchParams {
  const next = new URLSearchParams(prev);
  const setOrDel = (k: string, v: string | null) => {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  };
  setOrDel(`${URL_PREFIX}mode`, s.mode === "all" ? null : s.mode);
  setOrDel(`${URL_PREFIX}q`, s.search.trim() || null);
  setOrDel(`${URL_PREFIX}mods`, s.modules.length ? s.modules.join(",") : null);
  setOrDel(`${URL_PREFIX}risk`, s.risks.length ? s.risks.join(",") : null);
  setOrDel(`${URL_PREFIX}state`, s.states.length ? s.states.join(",") : null);
  const isAllRoles = s.visibleRoles.length === ALL_ROLE_KEYS.length
    && ALL_ROLE_KEYS.every((k) => s.visibleRoles.includes(k));
  setOrDel(`${URL_PREFIX}roles`, isAllRoles ? null : s.visibleRoles.join(","));
  const isDefaultCmp = s.compareRoles.length === 2
    && s.compareRoles[0] === INTERNAL_ROLES[0].key
    && s.compareRoles[1] === INTERNAL_ROLES[1].key;
  setOrDel(`${URL_PREFIX}cmp`, isDefaultCmp ? null : s.compareRoles.join(","));
  setOrDel(`${URL_PREFIX}priv`, s.privilegedOnly ? "1" : null);
  setOrDel(`${URL_PREFIX}diff`, s.differencesOnly ? "1" : null);
  return next;
}

export function useRoleMatrixFilters() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<RoleMatrixFilters>(() => ({ ...DEFAULT, ...readFromParams(params) }));
  const hydrated = useRef(false);

  // Sync state -> URL (skip initial hydration write).
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    const next = writeToParams(params, state);
    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true });
    }
     
  }, [state]);

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