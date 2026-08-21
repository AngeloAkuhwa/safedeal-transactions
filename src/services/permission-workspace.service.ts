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
import type { PermissionEnvironment } from "./permission-repository";
import { DEFAULT_ENVIRONMENT } from "./permission-repository";
import { evaluateApproval } from "./permission-approval-rules";

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
  is_system: boolean;
  status: "active" | "archived";
}

const roleMapCache = new Map<PermissionEnvironment, RoleGrantMap>();

export async function fetchRoleGrantMap(
  force = false,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<RoleGrantMap> {
  const cached = roleMapCache.get(env);
  if (cached && !force) return cached;
  const rows = await permissionRepo.listRoleGrants(env);
  const map = new Map<string, Set<string>>();
  for (const r of INTERNAL_ROLES) map.set(r.key, new Set());
  for (const row of rows) {
    const bag = map.get(row.role_key) ?? new Set();
    bag.add(row.permission_key);
    map.set(row.role_key, bag);
  }
  const built: RoleGrantMap = { map };
  roleMapCache.set(env, built);
  return built;
}

export function invalidateRoleGrantMap(env?: PermissionEnvironment) {
  if (env) roleMapCache.delete(env);
  else roleMapCache.clear();
}

// ---------------------------------------------------------------------------
// Role Detail helpers
// ---------------------------------------------------------------------------

export interface RoleAssignedUser {
  id: string;
  name: string;
  email: string;
  is_primary: boolean;
  status: string | null;
}

export async function fetchRoleAssignedUsers(role: InternalRoleKey): Promise<RoleAssignedUser[]> {
  const { data: rr, error } = await supabase
    .from("internal_user_roles")
    .select("user_id,is_primary,role_key")
    .eq("role_key", role);
  if (error) throw error;
  const ids = Array.from(new Set((rr ?? []).map((r) => r.user_id))).filter(Boolean);
  if (!ids.length) return [];
  const { data: users, error: uErr } = await supabase
    .from("internal_users")
    .select("id,full_name,email,status")
    .in("id", ids);
  if (uErr) throw uErr;
  const byId = new Map((users ?? []).map((u: any) => [u.id, u]));
  return (rr ?? [])
    .map((r) => {
      const u = byId.get(r.user_id);
      if (!u) return null;
      return {
        id: u.id,
        name: (u as any).full_name ?? "—",
        email: (u as any).email ?? "",
        is_primary: !!r.is_primary,
        status: (u as any).status ?? null,
      } as RoleAssignedUser;
    })
    .filter((r): r is RoleAssignedUser => !!r);
}

export async function fetchRoleUserCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("internal_user_roles").select("role_key");
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of data ?? []) out.set(r.role_key, (out.get(r.role_key) ?? 0) + 1);
  return out;
}

export async function fetchActiveSuperAdminCount(): Promise<number> {
  const { data, error } = await supabase
    .from("internal_user_roles")
    .select("user_id,internal_users!inner(status)")
    .eq("role_key", "super_admin");
  if (error) throw error;
  return (data ?? []).filter((r: any) => (r.internal_users?.status ?? "active") === "active").length;
}

export async function fetchPermissionEnvironments(): Promise<Map<string, PermissionEnvironment[]>> {
  const rows = await permissionRepo.listPermissionEnvironments();
  const out = new Map<string, PermissionEnvironment[]>();
  for (const r of rows) {
    const bag = out.get(r.permission_key) ?? [];
    bag.push(r.environment);
    out.set(r.permission_key, bag);
  }
  return out;
}

export interface PendingChangeRow {
  id: string;
  target_scope: string;
  target_key: string;
  reason: string | null;
  status: string;
  created_at: string;
  requested_by: string | null;
  before_keys: string[];
  after_keys: string[];
}

function normaliseKeys(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.permission_keys)) return payload.permission_keys as string[];
  return [];
}

export async function fetchPendingChangesForRole(
  role: InternalRoleKey,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<PendingChangeRow[]> {
  const rows = await permissionRepo.listChangeSets("pending", env);
  return rows
    .filter((r) => r.target_scope === "role" && r.target_key === role)
    .map((r) => ({
      id: r.id,
      target_scope: r.target_scope,
      target_key: r.target_key,
      reason: r.reason ?? null,
      status: r.status,
      created_at: r.created_at,
      requested_by: r.requested_by ?? null,
      before_keys: normaliseKeys(r.before),
      after_keys: normaliseKeys(r.after),
    }));
}

export async function fetchPendingChangesForPermission(
  permissionKey: string,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<PendingChangeRow[]> {
  const rows = await permissionRepo.listChangeSets("pending", env);
  const out: PendingChangeRow[] = [];
  for (const r of rows) {
    const before = normaliseKeys(r.before);
    const after = normaliseKeys(r.after);
    if (before.includes(permissionKey) || after.includes(permissionKey)) {
      out.push({
        id: r.id,
        target_scope: r.target_scope,
        target_key: r.target_key,
        reason: r.reason ?? null,
        status: r.status,
        created_at: r.created_at,
        requested_by: r.requested_by ?? null,
        before_keys: before,
        after_keys: after,
      });
    }
  }
  return out;
}

export async function fetchOverridesForPermission(
  permissionKey: string,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<Array<{ user_id: string; user_name: string; user_email: string; mode: string; reason: string | null; expires_at: string | null; created_at: string }>> {
  const all = await permissionRepo.listOverrides(env);
  const matching = all.filter((o) => o.permission_key === permissionKey);
  if (!matching.length) return [];
  const ids = Array.from(new Set(matching.map((o) => o.user_id)));
  const { data: users } = await supabase.from("internal_users").select("id,full_name,email").in("id", ids);
  const byId = new Map((users ?? []).map((u: any) => [u.id, u]));
  return matching.map((o) => {
    const u = byId.get(o.user_id);
    return {
      user_id: o.user_id,
      user_name: (u as any)?.full_name ?? "Unknown user",
      user_email: (u as any)?.email ?? "",
      mode: o.mode,
      reason: o.reason ?? null,
      expires_at: o.expires_at ?? null,
      created_at: o.granted_at,
    };
  });
}

export interface RoleLastModified {
  at: string | null;
  by_id: string | null;
  by_name: string | null;
}

export async function fetchRoleLastModified(role: InternalRoleKey, env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<RoleLastModified> {
  const changesets = await permissionRepo.listChangeSets(undefined, env);
  const forRole = changesets.filter((c) => c.target_scope === "role" && c.target_key === role);
  if (!forRole.length) return { at: null, by_id: null, by_name: null };
  forRole.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const top = forRole[0];
  let byName: string | null = null;
  if (top.requested_by) {
    const { data: u } = await supabase.from("internal_users").select("full_name").eq("id", top.requested_by).maybeSingle();
    byName = (u as any)?.full_name ?? null;
  }
  return { at: top.applied_at ?? top.created_at, by_id: top.requested_by ?? null, by_name: byName };
}

export async function fetchRoleHistory(role: InternalRoleKey, limit = 20): Promise<Array<{ id: string; action_type: string; created_at: string; actor_name: string | null; summary: string | null }>> {
  // Filter admin_actions for permission-related types where notes mention the role.
  const rows = await permissionRepo.listHistory(200, undefined, [
    "role_assigned", "role_changed", "permission_override_requested",
    "permission_override_approved", "permission_override_rejected",
    "role_change_approved", "role_change_rejected",
  ]);
  const filtered = rows.filter((r) => (r.action_notes ?? "").includes(role));
  const top = filtered.slice(0, limit);
  const ids = Array.from(new Set(top.map((r) => r.admin_user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("internal_users").select("id,full_name").in("id", ids);
    for (const u of data ?? []) names.set((u as any).id, (u as any).full_name ?? "—");
  }
  return top.map((r) => ({
    id: r.id,
    action_type: r.action_type,
    created_at: r.created_at,
    actor_name: r.admin_user_id ? (names.get(r.admin_user_id) ?? null) : null,
    summary: r.action_notes ?? null,
  }));
}

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
      is_system: !!r.is_system,
      status: (r.status ?? "active") as "active" | "archived",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute the diff of applying a template to a role and return an object
 * suitable for review + staging (via submitChangeSet).
 */
export interface ApplyTemplateDiff {
  add: string[];
  remove: string[];
  privileged_added: string[];
  approval_required: boolean;
  before: string[];
  after: string[];
  dependencies_added: Array<{ key: string; from: string[] }>;
}

export async function computeApplyTemplateDiff(
  templateId: string,
  role: InternalRoleKey,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<ApplyTemplateDiff> {
  const [templates, roleMap] = await Promise.all([
    listTemplates(),
    fetchRoleGrantMap(true, env),
  ]);
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) throw new Error("Template not found");
  const current = new Set(roleMap.map.get(role) ?? []);
  const target = new Set(tpl.permission_keys);
  const add = [...target].filter((k) => !current.has(k));
  const remove = [...current].filter((k) => !target.has(k));
  const privileged_added = add.filter(isPrivilegedPermission);
  // Which required perms are pulled in transitively by the additions.
  let deps: Array<{ permission_key: string; requires_key: string }> = [];
  try { deps = await permissionRepo.listPermissionDependencies() as any; } catch { deps = []; }
  const targetSet = target;
  const addedSet = new Set(add);
  const depsMap = new Map<string, Set<string>>();
  for (const d of deps) {
    if (!addedSet.has(d.permission_key)) continue;
    if (targetSet.has(d.requires_key)) continue; // already covered by template
    const bag = depsMap.get(d.requires_key) ?? new Set<string>();
    bag.add(d.permission_key);
    depsMap.set(d.requires_key, bag);
  }
  const dependencies_added = Array.from(depsMap.entries())
    .map(([key, from]) => ({ key, from: Array.from(from).sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    add, remove, privileged_added,
    approval_required: privileged_added.length > 0,
    before: [...current].sort(),
    after: [...target].sort(),
    dependencies_added,
  };
}

/**
 * For each template, list the roles whose current grant set is a superset of
 * (i.e. fully includes) the template's permissions in the given environment.
 * "Uses this template" == the role's baseline satisfies the template.
 */
export async function fetchTemplateRoleUsage(
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<Map<string, InternalRoleKey[]>> {
  const [templates, roleMap] = await Promise.all([
    listTemplates(),
    fetchRoleGrantMap(false, env),
  ]);
  const out = new Map<string, InternalRoleKey[]>();
  for (const t of templates) {
    const target = t.permission_keys;
    if (!target.length) { out.set(t.id, []); continue; }
    const matches: InternalRoleKey[] = [];
    for (const r of INTERNAL_ROLES) {
      const bag = roleMap.map.get(r.key);
      if (!bag) continue;
      let all = true;
      for (const k of target) { if (!bag.has(k)) { all = false; break; } }
      if (all) matches.push(r.key);
    }
    out.set(t.id, matches);
  }
  return out;
}

/**
 * Compute the diff needed to reset a role back to its "system default":
 * the seeded system template whose `role_source` equals the target role.
 * Falls back to the catalog snapshot when no such template exists.
 */
export interface ResetRoleDiff {
  add: string[];
  remove: string[];
  source: "system_template" | "catalog";
  template_id: string | null;
  before: string[];
  after: string[];
}
export async function computeRoleResetDiff(
  role: InternalRoleKey,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<ResetRoleDiff> {
  const [templates, roleMap] = await Promise.all([listTemplates(), fetchRoleGrantMap(true, env)]);
  const seed = templates.find((t) => t.is_system && t.role_source === role);
  const current = new Set(roleMap.map.get(role) ?? []);
  const target = new Set<string>(
    seed
      ? seed.permission_keys
      : PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key)),
  );
  const add = [...target].filter((k) => !current.has(k));
  const remove = [...current].filter((k) => !target.has(k));
  return {
    add, remove,
    source: seed ? "system_template" : "catalog",
    template_id: seed?.id ?? null,
    before: [...current].sort(),
    after: [...target].sort(),
  };
}

export async function stageRoleReset(
  role: InternalRoleKey,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
  reason?: string,
): Promise<ResetRoleDiff> {
  const diff = await computeRoleResetDiff(role, env);
  await permissionRepo.submitChangeSet({
    target_scope: "role",
    target_key: role,
    before: diff.before,
    after: diff.after,
    reason: reason ?? `Reset ${ROLE_LABEL[role]} to system default`,
    environment: env,
  });
  return diff;
}

export async function stageApplyTemplateToRole(
  templateId: string,
  role: InternalRoleKey,
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
  reason?: string,
) {
  const diff = await computeApplyTemplateDiff(templateId, role, env);
  await permissionRepo.submitChangeSet({
    target_scope: "role",
    target_key: role,
    before: diff.before,
    after: diff.after,
    reason: reason ?? `Apply template ${templateId} to ${role}`,
    environment: env,
  });
  return diff;
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
    is_system: false,
    status: "active",
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

// ---------------------------------------------------------------------------
// Change-set derived items (Pending Approvals + Change History tabs)
// Reads from `permission_change_sets`: the same table `ReviewChangesDrawer`
// writes into: so staged submissions surface in the queue immediately.
// ---------------------------------------------------------------------------

const RISK_ORDER: PermissionRiskLevel[] = ["low", "medium", "high", "critical"];

export interface PermissionApprovalItem {
  id: string;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  target_scope: string;
  target_key: string;
  target_label: string;
  added_keys: string[];
  removed_keys: string[];
  before_keys: string[];
  after_keys: string[];
  reason: string | null;
  status: string;
  requires_approval: boolean;
  environment: PermissionEnvironment;
  risk: PermissionRiskLevel;
  required_approver: string | null;
  review_comments: any[];
}

export interface PermissionApprovalFilter {
  env?: PermissionEnvironment;
  scope?: string;
  risk?: PermissionRiskLevel | "any";
  status?: string;
  requestedBy?: string;
  since?: string;
  until?: string;
  search?: string;
}

export interface PermissionHistoryItem {
  id: string;
  when: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_scope: string;
  target_key: string;
  target_label: string;
  previous_summary: string;
  new_summary: string;
  added_keys: string[];
  removed_keys: string[];
  before_keys: string[];
  after_keys: string[];
  reason: string | null;
  approval_ref: string;
  result: string;
  environment: PermissionEnvironment;
  audit_event_ref: string | null;
}

export interface PermissionHistoryFilter {
  env?: PermissionEnvironment;
  scope?: string;
  actorId?: string;
  since?: string;
  until?: string;
  result?: string;
  search?: string;
}

function scopeLabel(scope: string, key: string): string {
  if (scope === "role") return ROLE_LABEL[key as InternalRoleKey] ?? key;
  if (scope === "orchestration_rules") return `Assignment rules · ${key || "global"}`;
  return key;
}

function maxRiskLevel(keys: string[]): PermissionRiskLevel {
  let m: PermissionRiskLevel = "low";
  for (const k of keys) {
    const r = getPermissionRisk(k);
    if (RISK_ORDER.indexOf(r) > RISK_ORDER.indexOf(m)) m = r;
  }
  return m;
}

function diffKeys(before: any, after: any) {
  const b = new Set(normaliseKeys(before));
  const a = new Set(normaliseKeys(after));
  const added: string[] = [];
  const removed: string[] = [];
  for (const k of a) if (!b.has(k)) added.push(k);
  for (const k of b) if (!a.has(k)) removed.push(k);
  return { added, removed, before: [...b], after: [...a] };
}

async function hydrateInternalUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!clean.length) return new Map();
  const { data } = await supabase.from("internal_users").select("id,full_name").in("id", clean);
  return new Map((data ?? []).map((u: any) => [u.id, u.full_name ?? "—"]));
}

export async function fetchPermissionApprovalItems(
  filter: PermissionApprovalFilter = {},
): Promise<PermissionApprovalItem[]> {
  const env = filter.env ?? DEFAULT_ENVIRONMENT;
  const rows = await permissionRepo.listAllChangeSets({
    env,
    states: filter.status
      ? [filter.status as any]
      : (["pending_approval", "requested_changes", "approved"] as any),
    scope: filter.scope as any,
    requestedBy: filter.requestedBy,
    since: filter.since,
    until: filter.until,
    limit: 300,
  });
  const names = await hydrateInternalUserNames(rows.map((r) => r.requested_by));
  const items = rows.map((r): PermissionApprovalItem => {
    const d = diffKeys(r.before, r.after);
    const risk = maxRiskLevel([...d.added, ...d.removed]);
    const evalRes = evaluateApproval({
      targetScope: r.target_scope,
      targetKey: r.target_key,
      addedKeys: d.added,
      removedKeys: d.removed,
    });
    return {
      id: r.id,
      requested_by: r.requested_by,
      requested_by_name: r.requested_by ? (names.get(r.requested_by) ?? "Unknown user") : null,
      requested_at: r.submitted_at ?? r.created_at,
      target_scope: r.target_scope,
      target_key: r.target_key,
      target_label: scopeLabel(r.target_scope, r.target_key),
      added_keys: d.added,
      removed_keys: d.removed,
      before_keys: d.before,
      after_keys: d.after,
      reason: r.reason ?? null,
      status: r.status,
      requires_approval: !!r.requires_approval,
      environment: (r.environment ?? env) as PermissionEnvironment,
      risk,
      required_approver: evalRes.hits[0]?.message ?? (r.requires_approval ? "Approval required" : null),
      review_comments: Array.isArray(r.review_comments) ? (r.review_comments as any[]) : [],
    };
  });
  const filtered = filter.risk && filter.risk !== "any" ? items.filter((i) => i.risk === filter.risk) : items;
  if (!filter.search) return filtered;
  const q = filter.search.toLowerCase();
  return filtered.filter((i) =>
    i.target_label.toLowerCase().includes(q) ||
    i.target_key.toLowerCase().includes(q) ||
    (i.requested_by_name ?? "").toLowerCase().includes(q) ||
    (i.reason ?? "").toLowerCase().includes(q) ||
    i.id.toLowerCase().includes(q),
  );
}

export async function fetchPermissionHistoryItems(
  filter: PermissionHistoryFilter = {},
): Promise<PermissionHistoryItem[]> {
  const env = filter.env ?? DEFAULT_ENVIRONMENT;
  const rows = await permissionRepo.listAllChangeSets({
    env,
    states: filter.result
      ? [filter.result as any]
      : (["applied", "rejected", "cancelled", "failed"] as any),
    scope: filter.scope as any,
    since: filter.since,
    until: filter.until,
    limit: 300,
  });
  const names = await hydrateInternalUserNames(rows.map((r) => r.applied_by ?? r.requested_by));
  const items = rows.map((r): PermissionHistoryItem => {
    const d = diffKeys(r.before, r.after);
    const actorId = r.applied_by ?? r.requested_by ?? null;
    const action =
      r.status === "applied" ? "Applied change" :
      r.status === "rejected" ? "Rejected" :
      r.status === "cancelled" ? "Cancelled" :
      r.status === "failed" ? "Failed" : r.status;
    return {
      id: r.id,
      when: r.applied_at ?? r.created_at,
      actor_id: actorId,
      actor_name: actorId ? (names.get(actorId) ?? "Unknown user") : null,
      action,
      target_scope: r.target_scope,
      target_key: r.target_key,
      target_label: scopeLabel(r.target_scope, r.target_key),
      previous_summary: `${d.before.length} keys`,
      new_summary: `${d.after.length} keys`,
      added_keys: d.added,
      removed_keys: d.removed,
      before_keys: d.before,
      after_keys: d.after,
      reason: r.reason ?? null,
      approval_ref: r.id,
      result: r.status,
      environment: (r.environment ?? env) as PermissionEnvironment,
      audit_event_ref: null,
    };
  });
  if (filter.actorId) {
    return items.filter((i) => i.actor_id === filter.actorId);
  }
  if (!filter.search) return items;
  const q = filter.search.toLowerCase();
  return items.filter((i) =>
    i.target_label.toLowerCase().includes(q) ||
    i.target_key.toLowerCase().includes(q) ||
    (i.actor_name ?? "").toLowerCase().includes(q) ||
    (i.reason ?? "").toLowerCase().includes(q) ||
    i.id.toLowerCase().includes(q),
  );
}

/**
 * Map of `${scope}:${targetKey}:${permissionKey}` -> latest open change-set
 * status for the given environment. Used by cell-level markers to show a
 * pending/applied/rejected pill in the matrix without polling per cell.
 */
export async function fetchOpenChangeSetsByCell(
  env: PermissionEnvironment = DEFAULT_ENVIRONMENT,
): Promise<Map<string, string>> {
  const rows = await permissionRepo.listAllChangeSets({
    env,
    states: ["pending_approval", "requested_changes", "approved", "failed"] as any,
    limit: 300,
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const d = diffKeys(r.before, r.after);
    for (const k of [...d.added, ...d.removed]) {
      const cell = `${r.target_scope}:${r.target_key}:${k}`;
      if (!out.has(cell)) out.set(cell, r.status);
    }
  }
  return out;
}
