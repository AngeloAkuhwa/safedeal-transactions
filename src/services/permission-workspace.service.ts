// Read-only aggregation service that powers the Feature Registry & Permission
// Matrix workspace. Reuses the existing tables (`role_permissions`,
// `user_permission_overrides`, `access_change_requests`, `admin_actions`) so
// no data is duplicated and the surface stays a single source of truth with
// Users & Access.

import { supabase } from "@/integrations/supabase/client";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  isPrivilegedPermission,
  type InternalRoleKey,
} from "./permission-catalog";

export interface RoleGrantMap {
  map: Map<string, Set<string>>;
}

export interface OverrideRow {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: InternalRoleKey | null;
  permission_key: string;
  permission_label: string;
  module_label: string;
  mode: "grant" | "revoke";
  reason: string | null;
  created_at: string;
  privileged: boolean;
}

export interface ApprovalRow {
  id: string;
  target_user_id: string;
  target_user_name: string;
  requested_by: string;
  requested_by_name: string;
  change_type: string;
  payload: any;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface HistoryRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  action_type: string;
  summary: string | null;
  metadata: any;
  created_at: string;
}

export interface WorkspaceSummary {
  active_roles: number;
  registered_permissions: number;
  privileged_permissions: number;
  overrides_total: number;
  pending_total: number;
  recent_changes_24h: number;
}

export interface PermissionTemplate {
  id: string;
  name: string;
  description: string;
  role_source: InternalRoleKey | null;
  permission_keys: string[];
  created_at: string;
  updated_at: string;
}

let cachedRoleMap: RoleGrantMap | null = null;

export async function fetchRoleGrantMap(force = false): Promise<RoleGrantMap> {
  if (cachedRoleMap && !force) return cachedRoleMap;
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_key,permission_key");
  if (error) throw error;
  const map = new Map<string, Set<string>>();
  for (const r of INTERNAL_ROLES) map.set(r.key, new Set());
  for (const row of data ?? []) {
    const bag = map.get(row.role_key) ?? new Set();
    bag.add(row.permission_key);
    map.set(row.role_key, bag);
  }
  cachedRoleMap = { map };
  return cachedRoleMap;
}

export function invalidateRoleGrantMap() { cachedRoleMap = null; }

export async function fetchOverrides(): Promise<OverrideRow[]> {
  const [ovRes, usersRes, rolesRes] = await Promise.all([
    supabase
      .from("user_permission_overrides")
      .select("user_id,permission_key,mode,reason,granted_by,granted_at")
      .order("granted_at", { ascending: false }),
    supabase.from("internal_users").select("id,full_name,email"),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
  ]);
  if (ovRes.error) throw ovRes.error;
  if (usersRes.error) throw usersRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const userById = new Map<string, { name: string; email: string }>();
  for (const u of usersRes.data ?? []) {
    userById.set(u.id, { name: u.full_name ?? "—", email: u.email ?? "" });
  }
  const primaryByUser = new Map<string, string>();
  for (const r of rolesRes.data ?? []) {
    if (r.is_primary || !primaryByUser.has(r.user_id)) {
      primaryByUser.set(r.user_id, r.role_key);
    }
  }

  const permIndex = new Map<string, { label: string; module: string }>();
  for (const m of PERMISSION_MODULES) {
    for (const p of m.permissions) permIndex.set(p.key, { label: p.label, module: m.label });
  }

  return (ovRes.data ?? []).map((row: any): OverrideRow => {
    const u = userById.get(row.user_id);
    const meta = permIndex.get(row.permission_key);
    return {
      user_id: row.user_id,
      user_name: u?.name ?? "Unknown user",
      user_email: u?.email ?? "",
      user_role: (primaryByUser.get(row.user_id) ?? null) as InternalRoleKey | null,
      permission_key: row.permission_key,
      permission_label: meta?.label ?? row.permission_key,
      module_label: meta?.module ?? "—",
      mode: row.mode as "grant" | "revoke",
      reason: row.reason ?? null,
      created_at: row.granted_at,
      privileged: isPrivilegedPermission(row.permission_key),
    };
  });
}

export async function fetchPendingApprovals(): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("access_change_requests")
    .select("id,target_user_id,requested_by,change_type,payload,reason,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.target_user_id, r.requested_by].filter(Boolean))));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from("internal_users").select("id,full_name").in("id", ids);
    for (const u of users ?? []) names.set(u.id, u.full_name ?? "—");
  }
  return rows.map((r): ApprovalRow => ({
    id: r.id,
    target_user_id: r.target_user_id,
    target_user_name: names.get(r.target_user_id) ?? "Unknown user",
    requested_by: r.requested_by,
    requested_by_name: names.get(r.requested_by) ?? "Unknown user",
    change_type: r.change_type,
    payload: r.payload,
    reason: r.reason ?? null,
    status: r.status,
    created_at: r.created_at,
  }));
}

const HISTORY_ACTION_TYPES = [
  "role_assigned",
  "role_changed",
  "permission_override_requested",
  "permission_override_approved",
  "permission_override_rejected",
  "role_change_approved",
  "role_change_rejected",
] as const;

export async function fetchChangeHistory(limit = 100, sinceHours?: number): Promise<HistoryRow[]> {
  let q = supabase
    .from("admin_actions")
    .select("id,admin_user_id,target_user_id,action_type,action_notes,created_at")
    .in("action_type", HISTORY_ACTION_TYPES)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sinceHours && sinceHours > 0) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", since);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.admin_user_id, r.target_user_id].filter(Boolean))));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from("internal_users").select("id,full_name").in("id", ids);
    for (const u of users ?? []) names.set(u.id, u.full_name ?? "—");
  }
  return rows.map((r): HistoryRow => ({
    id: r.id,
    actor_id: r.admin_user_id ?? null,
    actor_name: r.admin_user_id ? (names.get(r.admin_user_id) ?? null) : null,
    target_user_id: r.target_user_id ?? null,
    target_user_name: r.target_user_id ? (names.get(r.target_user_id) ?? null) : null,
    action_type: r.action_type,
    summary: r.action_notes ?? null,
    metadata: null,
    created_at: r.created_at,
  }));
}

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [roleMap, overrides, pending, recent] = await Promise.all([
    fetchRoleGrantMap(),
    supabase.from("user_permission_overrides").select("user_id", { count: "exact", head: true }),
    supabase.from("access_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("admin_actions").select("id", { count: "exact", head: true }).in("action_type", HISTORY_ACTION_TYPES).gte("created_at", since24h),
  ]);
  const activeRoles = INTERNAL_ROLES.filter((r) => (roleMap.map.get(r.key)?.size ?? 0) > 0).length;
  const registered = PERMISSION_MODULES.reduce((n, m) => n + m.permissions.length, 0);
  const privileged = PERMISSION_MODULES.reduce(
    (n, m) => n + m.permissions.filter((p) => isPrivilegedPermission(p.key)).length,
    0,
  );
  return {
    active_roles: activeRoles,
    registered_permissions: registered,
    privileged_permissions: privileged,
    overrides_total: overrides.count ?? 0,
    pending_total: pending.count ?? 0,
    recent_changes_24h: recent.count ?? 0,
  };
}

const TEMPLATE_STORE_KEY = "safedeal.permMatrix.templates.v1";
const TEMPLATE_SETTING_KEY = "permissions.templates";

function readTemplates(): PermissionTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATE_STORE_KEY);
    return raw ? (JSON.parse(raw) as PermissionTemplate[]) : [];
  } catch { return []; }
}

function writeTemplates(t: PermissionTemplate[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(t));
}

// Templates persist to `system_settings` (shared across teammates) with a
// per-browser localStorage fallback so the workspace remains usable even if
// the platform_settings row hasn't been seeded yet.
async function readTemplatesRemote(): Promise<PermissionTemplate[] | null> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", TEMPLATE_SETTING_KEY)
      .maybeSingle();
    if (error) return null;
    const val = (data as any)?.setting_value;
    if (Array.isArray(val)) return val as PermissionTemplate[];
    if (val && Array.isArray((val as any).templates)) return (val as any).templates as PermissionTemplate[];
    return [];
  } catch { return null; }
}

async function writeTemplatesRemote(t: PermissionTemplate[]): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { setting_key: TEMPLATE_SETTING_KEY, setting_value: t as any, updated_at: new Date().toISOString() } as any,
        { onConflict: "setting_key,scope,vendor_id" },
      );
    return !error;
  } catch { return false; }
}

export async function listTemplates(): Promise<PermissionTemplate[]> {
  const remote = await readTemplatesRemote();
  const source = remote && remote.length ? remote : readTemplates();
  return [...source].sort((a, b) => a.name.localeCompare(b.name));
}

export async function cloneRoleAsTemplate(role: InternalRoleKey, name: string, description = ""): Promise<PermissionTemplate> {
  const roleMap = await fetchRoleGrantMap();
  const perms = Array.from(roleMap.map.get(role) ?? []).sort();
  const now = new Date().toISOString();
  const tpl: PermissionTemplate = {
    id: crypto.randomUUID(),
    name: name.trim() || `${ROLE_LABEL[role]} clone`,
    description: description.trim(),
    role_source: role,
    permission_keys: perms,
    created_at: now,
    updated_at: now,
  };
  const remote = (await readTemplatesRemote()) ?? readTemplates();
  const next = [...remote, tpl];
  const ok = await writeTemplatesRemote(next);
  if (!ok) writeTemplates(next);
  return tpl;
}

export async function deleteTemplate(id: string) {
  const remote = (await readTemplatesRemote()) ?? readTemplates();
  const next = remote.filter((t) => t.id !== id);
  const ok = await writeTemplatesRemote(next);
  if (!ok) writeTemplates(next);
}

export type CellState = "full" | "partial" | "none";

export interface CellInfo {
  state: CellState;
  granted: number;
  total: number;
}

export function computeCell(
  roleMap: RoleGrantMap,
  role: InternalRoleKey,
  moduleKey: string,
): CellInfo {
  const mod = PERMISSION_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return { state: "none", granted: 0, total: 0 };
  const bag = roleMap.map.get(role) ?? new Set<string>();
  let granted = 0;
  for (const p of mod.permissions) if (bag.has(p.key)) granted++;
  const total = mod.permissions.length;
  const state: CellState = granted === 0 ? "none" : granted === total ? "full" : "partial";
  return { state, granted, total };
}

export const HISTORY_ACTION_LABEL: Record<string, string> = {
  role_assigned: "Role assigned",
  role_changed: "Role changed",
  permission_override_requested: "Override requested",
  permission_override_approved: "Override approved",
  permission_override_rejected: "Override rejected",
  role_change_approved: "Role change approved",
  role_change_rejected: "Role change rejected",
};
