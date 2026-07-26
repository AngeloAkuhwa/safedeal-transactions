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
  getPermissionRisk,
  type PermissionRiskLevel,
  type PermissionSource,
  type InternalRoleKey,
} from "./permission-catalog";
import { permissionRepo } from "./permission-repository";

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
  expires_at: string | null;
  source: PermissionSource;
  risk: PermissionRiskLevel;
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
  const rows = await permissionRepo.listRoleGrants();
  const map = new Map<string, Set<string>>();
  for (const r of INTERNAL_ROLES) map.set(r.key, new Set());
  for (const row of rows) {
    const bag = map.get(row.role_key) ?? new Set();
    bag.add(row.permission_key);
    map.set(row.role_key, bag);
  }
  cachedRoleMap = { map };
  return cachedRoleMap;
}

export function invalidateRoleGrantMap() { cachedRoleMap = null; }

export async function fetchOverrides(): Promise<OverrideRow[]> {
  const [overrides, usersRes, rolesRes] = await Promise.all([
    permissionRepo.listOverrides(),
    supabase.from("internal_users").select("id,full_name,email"),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
  ]);
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

  return overrides.map((row): OverrideRow => {
    const u = userById.get(row.user_id);
    const meta = permIndex.get(row.permission_key);
    const expires = row.expires_at ?? null;
    const stillActive = expires ? new Date(expires) > new Date() : true;
    const source: PermissionSource = expires && stillActive
      ? "temporary_access"
      : "user_override";
    const risk = getPermissionRisk(row.permission_key);
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
      expires_at: expires,
      source,
      risk,
      privileged: isPrivilegedPermission(row.permission_key),
    };
  });
}

export async function fetchPendingApprovals(): Promise<ApprovalRow[]> {
  const rows = await permissionRepo.listApprovals();
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

/**
 * Build a per-user set of permission_keys with an open pending permission
 * change_request. Used by `derivePermissionRowState` to render the "pending"
 * row-state without a second round trip in tight components.
 */
export async function fetchPendingPermissionKeysByUser(): Promise<Map<string, Set<string>>> {
  const rows = await permissionRepo.listApprovals();
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.change_type !== "permission") continue;
    const payload = r.payload as { permission_key?: string } | null;
    if (!payload?.permission_key) continue;
    const bag = out.get(r.target_user_id) ?? new Set<string>();
    bag.add(payload.permission_key);
    out.set(r.target_user_id, bag);
  }
  return out;
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
  const rows = await permissionRepo.listHistory(limit, sinceHours, [...HISTORY_ACTION_TYPES]);
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

// Templates are persisted through `permissionRepo` against the dedicated
// `permission_templates` + `permission_template_items` tables. All writes
// route through change-set-aware repo methods so the audit trail catches
// them alongside role/user edits.
export async function listTemplates(): Promise<PermissionTemplate[]> {
  const rows = await permissionRepo.listTemplates();
  return rows
    .map((r): PermissionTemplate => ({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      role_source: (r.role_source ?? null) as InternalRoleKey | null,
      permission_keys: r.permission_keys,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function cloneRoleAsTemplate(
  role: InternalRoleKey,
  name: string,
  description = "",
): Promise<PermissionTemplate> {
  const roleMap = await fetchRoleGrantMap();
  const perms = Array.from(roleMap.map.get(role) ?? []).sort();
  const created = await permissionRepo.createTemplate(
    { name: name.trim() || `${ROLE_LABEL[role]} clone`, description: description.trim(), role_source: role },
    perms,
  );
  // Record the create as a change set so it shows up in Recent Changes.
  await permissionRepo.submitChangeSet({
    target_scope: "template",
    target_key: created.id,
    before: null,
    after: { name: created.name, role_source: role, permission_keys: perms },
    reason: `Cloned template from ${ROLE_LABEL[role]}`,
  });
  return {
    id: created.id,
    name: created.name,
    description: created.description ?? "",
    role_source: (created.role_source ?? null) as InternalRoleKey | null,
    permission_keys: created.permission_keys,
    created_at: created.created_at,
    updated_at: created.updated_at,
  };
}

export async function deleteTemplate(id: string) {
  await permissionRepo.submitChangeSet({
    target_scope: "template",
    target_key: id,
    before: { id },
    after: null,
    reason: "Template deleted",
  });
  await permissionRepo.deleteTemplate(id);
}

export async function updateTemplateItems(id: string, keys: string[], before: string[]) {
  await permissionRepo.submitChangeSet({
    target_scope: "template",
    target_key: id,
    before: { permission_keys: before },
    after: { permission_keys: keys },
    reason: "Template items updated",
  });
  await permissionRepo.setTemplateItems(id, keys);
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
