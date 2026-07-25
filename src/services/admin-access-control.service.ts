// Access Control Management service — Supabase backed.
// Model is documented in mem://architecture/service-layer.

import { supabase } from "@/integrations/supabase/client";
import {
  ACCESS_LABEL,
  ALL_PERMISSION_KEYS,
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  deriveAccessLevel,
  isProtectedRole,
  validateRoleSet,
  type AccessLevel,
  type InternalRoleKey,
  type PermissionModule,
} from "./permission-catalog";

export {
  ACCESS_LABEL, ROLE_LABEL, deriveAccessLevel, isProtectedRole, validateRoleSet,
  PERMISSION_MODULES,
};
export type { AccessLevel, InternalRoleKey, PermissionModule };

export type InternalRole = InternalRoleKey;

export type InternalUserStatus =
  | "active"
  | "suspended"
  | "pending_approval"
  | "invited"
  | "locked"
  | "deactivated";

export interface InternalUser {
  id: string;
  display_id: string;
  employee_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  access_level: AccessLevel;
  status: InternalUserStatus;
  last_active_at: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  department: string | null;
  team: string | null;
  job_title: string | null;
  reporting_manager_id: string | null;
  reporting_manager_name: string | null;
  reporting_manager_role: InternalRoleKey | null;
  access_expires_at: string | null;
  reason_for_access: string | null;
  invitation_status: "not_invited" | "sent" | "accepted" | "expired" | "revoked";
  permissions: string[];         // effective (union - revokes + grants)
  base_permissions: string[];    // from roles only
  grants: string[];              // explicit grants (overrides)
  revokes: string[];             // explicit revokes (overrides)
}

export interface AccessSummary {
  active_admins: number;
  admins_delta_week: number;
  active_agents: number;
  agents_delta_week: number;
  suspended_users: number;
  suspended_delta_week: number;
  full_access_users: number;
  pending_invites: number;
  pending_approvals: number;
  suspended_or_locked: number;
  privileged_users: number;
}

export type AccessFilter =
  | "all" | "admins" | "agents" | "finance"
  | "compliance" | "identity" | "auditors"
  | "suspended" | "critical"
  | "invited" | "pending_approval" | "suspended_or_locked" | "privileged";

export interface AccessDirectoryQuery {
  filter?: AccessFilter;
  q?: string;
  role?: InternalRoleKey | null;
  department?: string | null;
  status?: InternalUserStatus | null;
  access_level?: AccessLevel | null;
  sort_by?: "name" | "role" | "status" | "access_level" | "last_active";
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface AccessDirectoryResponse {
  summary: AccessSummary;
  rows: InternalUser[];
  total: number;
  page: number;
  page_size: number;
  departments: string[];
}

export interface AccessAuditEntry {
  id: string;
  user_id: string;
  actor_name: string;
  action: string;
  detail: string;
  created_at: string;
  severity: "info" | "warning" | "critical";
  metadata: Record<string, unknown>;
}

export interface AccessChangeRequest {
  id: string;
  target_user_id: string;
  target_name: string | null;
  requested_by: string;
  requested_by_name: string | null;
  change_type: "role" | "permission" | "suspend" | "reactivate";
  payload: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
}

// ---------- Role classification helpers ----------

const ADMIN_ROLES: InternalRoleKey[] = ["super_admin", "senior_admin"];
const AGENT_ROLES: InternalRoleKey[] = ["dispute_manager", "dispute_agent", "support_agent"];
const FINANCE_ROLES: InternalRoleKey[] = ["finance_operator", "finance_approver"];
const COMPLIANCE_ROLES: InternalRoleKey[] = ["compliance_officer"];
const IDENTITY_ROLES: InternalRoleKey[] = ["identity_officer"];
const AUDITOR_ROLES: InternalRoleKey[] = ["auditor"];

function overlaps<T>(a: T[], b: T[]) { return a.some((x) => b.includes(x)); }

function passesFilter(u: InternalUser, f: AccessFilter): boolean {
  switch (f) {
    case "admins":     return overlaps(u.roles, ADMIN_ROLES);
    case "agents":     return overlaps(u.roles, AGENT_ROLES);
    case "finance":    return overlaps(u.roles, FINANCE_ROLES);
    case "compliance": return overlaps(u.roles, COMPLIANCE_ROLES);
    case "identity":   return overlaps(u.roles, IDENTITY_ROLES);
    case "auditors":   return overlaps(u.roles, AUDITOR_ROLES);
    case "suspended":  return u.status === "suspended";
    case "critical":   return u.access_level === "full" || u.access_level === "high";
    case "invited":            return u.status === "invited";
    case "pending_approval":   return u.status === "pending_approval";
    case "suspended_or_locked":return u.status === "suspended" || u.status === "locked";
    case "privileged":         return u.access_level === "full" || u.access_level === "high";
    case "all":
    default:           return true;
  }
}

// ---------- Directory ----------

let cachedRolePerms: Map<string, string[]> | null = null;
async function loadRolePermissions(): Promise<Map<string, string[]>> {
  if (cachedRolePerms) return cachedRolePerms;
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_key,permission_key");
  if (error) throw error;
  const map = new Map<string, string[]>();
  for (const r of data ?? []) {
    const arr = map.get(r.role_key) ?? [];
    arr.push(r.permission_key);
    map.set(r.role_key, arr);
  }
  cachedRolePerms = map;
  return map;
}

export function invalidateRolePermissionCache() { cachedRolePerms = null; }

function computeEffective(roles: string[], grants: string[], revokes: string[], rolePerms: Map<string, string[]>): {
  base: string[]; effective: string[];
} {
  const base = new Set<string>();
  for (const r of roles) for (const p of (rolePerms.get(r) ?? [])) base.add(p);
  const eff = new Set<string>(base);
  for (const g of grants) eff.add(g);
  for (const r of revokes) eff.delete(r);
  return { base: Array.from(base).sort(), effective: Array.from(eff).sort() };
}

export async function fetchAccessDirectory(q: AccessDirectoryQuery = {}): Promise<AccessDirectoryResponse> {
  const [rolePerms, usersRes, rolesRes, overridesRes] = await Promise.all([
    loadRolePermissions(),
    supabase.from("internal_users").select("*").order("created_at", { ascending: false }),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
    supabase.from("user_permission_overrides").select("user_id,permission_key,mode"),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (rolesRes.error) throw rolesRes.error;
  if (overridesRes.error) throw overridesRes.error;

  const rolesByUser = new Map<string, { key: string; primary: boolean }[]>();
  for (const r of rolesRes.data ?? []) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push({ key: r.role_key, primary: !!r.is_primary });
    rolesByUser.set(r.user_id, arr);
  }
  const overridesByUser = new Map<string, { grants: string[]; revokes: string[] }>();
  for (const o of overridesRes.data ?? []) {
    const cur = overridesByUser.get(o.user_id) ?? { grants: [], revokes: [] };
    if (o.mode === "grant") cur.grants.push(o.permission_key);
    else cur.revokes.push(o.permission_key);
    overridesByUser.set(o.user_id, cur);
  }

  // Build a lookup so we can resolve reporting-manager metadata locally.
  const userById = new Map<string, any>();
  for (const row of (usersRes.data ?? [])) userById.set(row.id, row);

  const all: InternalUser[] = (usersRes.data ?? []).map((row): InternalUser => {
    const rr = rolesByUser.get(row.id) ?? [];
    const roles = rr.map((x) => x.key as InternalRoleKey);
    const primary = (rr.find((x) => x.primary)?.key ?? rr[0]?.key ?? "support_agent") as InternalRoleKey;
    const ov = overridesByUser.get(row.id) ?? { grants: [], revokes: [] };
    const { base, effective } = computeEffective(roles, ov.grants, ov.revokes, rolePerms);
    const managerRow = row.reporting_manager_id ? userById.get(row.reporting_manager_id) : null;
    const managerRoles = managerRow ? (rolesByUser.get(managerRow.id) ?? []) : [];
    const managerPrimary = managerRoles.find((x) => x.primary)?.key ?? managerRoles[0]?.key ?? null;
    return {
      id: row.id,
      display_id: row.display_id,
      employee_id: row.employee_id ?? row.display_id,
      full_name: row.full_name,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email: row.email,
      avatar_url: null,
      roles,
      primary_role: primary,
      access_level: deriveAccessLevel(effective, roles),
      status: row.status as InternalUserStatus,
      last_active_at: row.last_active_at,
      two_factor_enabled: !!row.two_factor_enabled,
      created_at: row.created_at,
      department: row.department,
      team: row.team ?? null,
      job_title: row.job_title ?? null,
      reporting_manager_id: row.reporting_manager_id ?? null,
      reporting_manager_name: managerRow?.full_name ?? null,
      reporting_manager_role: (managerPrimary as InternalRoleKey | null) ?? null,
      access_expires_at: row.access_expires_at ?? null,
      reason_for_access: row.reason_for_access ?? null,
      invitation_status: (row.invitation_status ?? "not_invited") as InternalUser["invitation_status"],
      permissions: effective,
      base_permissions: base,
      grants: ov.grants,
      revokes: ov.revokes,
    };
  });

  const filter = q.filter ?? "all";
  const search = (q.q ?? "").trim().toLowerCase();
  let rows = all
    .filter((u) => passesFilter(u, filter))
    .filter((u) => {
      if (!search) return true;
      const hay = [
        u.full_name, u.email, u.display_id, u.department ?? "",
        ...u.roles.map((r) => ROLE_LABEL[r] ?? r),
      ].join(" ").toLowerCase();
      return hay.includes(search);
    })
    .filter((u) => (q.role ? u.roles.includes(q.role) : true))
    .filter((u) => (q.department ? (u.department ?? "") === q.department : true))
    .filter((u) => (q.status ? u.status === q.status : true))
    .filter((u) => (q.access_level ? u.access_level === q.access_level : true));

  const sortBy = q.sort_by ?? "last_active";
  const dir = (q.sort_dir ?? "desc") === "asc" ? 1 : -1;
  const accessRank: Record<AccessLevel, number> = { full: 4, high: 3, standard: 2, limited: 1 };
  const statusRank: Record<InternalUserStatus, number> = {
    active: 6, invited: 5, pending_approval: 4, suspended: 3, locked: 2, deactivated: 1,
  };
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name": cmp = a.full_name.localeCompare(b.full_name); break;
      case "role": cmp = (ROLE_LABEL[a.primary_role] ?? "").localeCompare(ROLE_LABEL[b.primary_role] ?? ""); break;
      case "status": cmp = statusRank[a.status] - statusRank[b.status]; break;
      case "access_level": cmp = accessRank[a.access_level] - accessRank[b.access_level]; break;
      case "last_active":
      default: {
        const at = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        const bt = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        cmp = at - bt;
      }
    }
    return cmp * dir;
  });

  const total = rows.length;
  const page_size = Math.max(1, q.page_size ?? 25);
  const page = Math.max(1, q.page ?? 1);
  const start = (page - 1) * page_size;
  const pagedRows = rows.slice(start, start + page_size);

  const departments = Array.from(
    new Set(all.map((u) => u.department).filter((d): d is string => !!d)),
  ).sort();

  const summary: AccessSummary = {
    active_admins: all.filter((u) => overlaps(u.roles, ADMIN_ROLES) && u.status === "active").length,
    admins_delta_week: 0,
    active_agents: all.filter((u) => overlaps(u.roles, AGENT_ROLES) && u.status === "active").length,
    agents_delta_week: 0,
    suspended_users: all.filter((u) => u.status === "suspended").length,
    suspended_delta_week: 0,
    full_access_users: all.filter((u) => u.access_level === "full").length,
    pending_invites: all.filter((u) => u.status === "invited").length,
    pending_approvals: all.filter((u) => u.status === "pending_approval").length,
    suspended_or_locked: all.filter((u) => u.status === "suspended" || u.status === "locked").length,
    privileged_users: all.filter((u) => u.access_level === "full" || u.access_level === "high").length,
  };

  return { summary, rows: pagedRows, total, page, page_size, departments };
}

// ---------- Audit history ----------

export async function fetchAccessAudit(userId: string): Promise<AccessAuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,description,created_at,metadata,actor_user_id")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;

  const actorIds = Array.from(new Set((data ?? []).map((r: any) => r.actor_user_id).filter(Boolean)));
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles").select("id,full_name").in("id", actorIds);
    for (const p of profs ?? []) names.set(p.id, p.full_name ?? "Admin");
  }

  return (data ?? []).map((r: any): AccessAuditEntry => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const sev = typeof meta.severity === "string" ? meta.severity : "info";
    return {
      id: r.id,
      user_id: userId,
      actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? "Admin") : "System",
      action: String(meta.access_action ?? r.action ?? "action"),
      detail: String(r.description ?? ""),
      created_at: r.created_at,
      severity: (["critical", "warning", "info"].includes(sev) ? sev : "info") as AccessAuditEntry["severity"],
      metadata: meta,
    };
  });
}

// ---------- Mutations ----------

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

async function auditLog(target_user_id: string, action_type: string, description: string, severity: "info" | "warning" | "critical" = "info", metadata: Record<string, unknown> = {}) {
  try {
    const uid = await currentUserId();
    await supabase.from("audit_logs").insert({
      actor_user_id: uid,
      target_user_id,
      action: "admin_internal_note",
      description: `[${action_type}] ${description}`,
      metadata: { ...metadata, access_action: action_type, severity },
    });
  } catch { /* audit best-effort */ }
}

export interface UpdateRolesInput {
  user_id: string;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  reason: string;
}

/**
 * Replaces a user's role set. If any of the added/removed roles is protected
 * and the caller isn't super_admin, this queues an access_change_request
 * instead of applying immediately.
 */
export async function updateUserRoles(input: UpdateRolesInput): Promise<{ applied: boolean; request_id?: string }> {
  const check = validateRoleSet(input.roles);
  if (!check.ok) throw new Error(check.error);
  if (!input.roles.includes(input.primary_role)) {
    throw new Error("Primary role must be one of the assigned roles.");
  }
  const requester = await currentUserId();

  // Read current state
  const { data: current, error: curErr } = await supabase
    .from("internal_user_roles")
    .select("role_key,is_primary")
    .eq("user_id", input.user_id);
  if (curErr) throw curErr;

  const before = new Set((current ?? []).map((r: any) => r.role_key));
  const after = new Set(input.roles);
  const added = [...after].filter((r) => !before.has(r));
  const removed = [...before].filter((r) => !after.has(r));
  const hasProtected = [...added, ...removed].some(isProtectedRole);

  // If protected and caller isn't super_admin, queue for approval
  const { data: myRoles } = await supabase
    .from("internal_user_roles")
    .select("role_key")
    .eq("user_id", requester);
  const isSuper = (myRoles ?? []).some((r: any) => r.role_key === "super_admin");

  if (hasProtected && !isSuper) {
    const { data: req, error: reqErr } = await supabase
      .from("access_change_requests")
      .insert({
        target_user_id: input.user_id,
        requested_by: requester,
        change_type: "role",
        payload: { roles: input.roles, primary_role: input.primary_role },
        reason: input.reason,
      })
      .select("id")
      .single();
    if (reqErr) throw reqErr;
    await auditLog(input.user_id, "access_role_change_requested",
      `Role change queued for approval (added: ${added.join(", ") || "—"}, removed: ${removed.join(", ") || "—"})`,
      "warning", { request_id: req.id });
    return { applied: false, request_id: req.id };
  }

  // Apply atomically-ish: delete removed, upsert kept, ensure single primary
  if (removed.length) {
    const { error } = await supabase
      .from("internal_user_roles")
      .delete()
      .eq("user_id", input.user_id)
      .in("role_key", removed);
    if (error) throw error;
  }

  // Clear existing primary, then insert/update rows for the new set
  await supabase.from("internal_user_roles")
    .update({ is_primary: false })
    .eq("user_id", input.user_id);

  for (const role of input.roles) {
    const { error } = await supabase
      .from("internal_user_roles")
      .upsert({
        user_id: input.user_id,
        role_key: role,
        is_primary: role === input.primary_role,
        assigned_by: requester,
      }, { onConflict: "user_id,role_key" });
    if (error) throw error;
  }

  await auditLog(input.user_id, "access_roles_updated",
    `Roles updated (added: ${added.join(", ") || "—"}, removed: ${removed.join(", ") || "—"}, primary: ${input.primary_role})`,
    hasProtected ? "warning" : "info",
    { before: [...before], after: [...after], primary: input.primary_role, reason: input.reason });
  return { applied: true };
}

export interface UpdatePermissionsInput {
  user_id: string;
  grants: string[];
  revokes: string[];
  reason: string;
}

export async function updatePermissionOverrides(input: UpdatePermissionsInput): Promise<void> {
  const invalid = [...input.grants, ...input.revokes].filter((k) => !ALL_PERMISSION_KEYS.includes(k));
  if (invalid.length) throw new Error(`Unknown permission keys: ${invalid.join(", ")}`);
  const requester = await currentUserId();

  const { error: delErr } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", input.user_id);
  if (delErr) throw delErr;

  const rows = [
    ...input.grants.map((k) => ({ user_id: input.user_id, permission_key: k, mode: "grant", reason: input.reason, granted_by: requester })),
    ...input.revokes.map((k) => ({ user_id: input.user_id, permission_key: k, mode: "revoke", reason: input.reason, granted_by: requester })),
  ];
  if (rows.length) {
    const { error } = await supabase.from("user_permission_overrides").insert(rows);
    if (error) throw error;
  }
  await auditLog(input.user_id, "access_permissions_updated",
    `Permission overrides updated (${input.grants.length} grants / ${input.revokes.length} revokes)`,
    "warning", { grants: input.grants, revokes: input.revokes, reason: input.reason });
}

export interface SuspendInput { user_id: string; reason: string; }

export async function suspendInternalUser(input: SuspendInput): Promise<void> {
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "suspended" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_suspended", `Suspended: ${input.reason}`, "critical", { reason: input.reason });
}

export async function reactivateInternalUser(input: SuspendInput): Promise<void> {
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "active" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_reactivated", `Reactivated: ${input.reason}`, "info", { reason: input.reason });
}

export async function deactivateInternalUser(input: SuspendInput): Promise<void> {
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "deactivated" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_deactivated",
    `Deactivated (retained for audit): ${input.reason}`, "critical", { reason: input.reason });
}

export async function resendInternalUserInvite(input: { user_id: string; email: string; full_name: string; }): Promise<void> {
  try {
    await supabase.functions.invoke("admin-invite-internal-user", {
      body: { ...input, resend: true },
    });
  } catch {
    /* best-effort — still audit */
  }
  await auditLog(input.user_id, "access_invite_resent",
    `Resent invitation to ${input.email}`, "info", { email: input.email });
}

export interface InviteUserInput {
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  department: string;
  team?: string;
  job_title?: string;
  reporting_manager_id?: string | null;
  access_expires_at?: string | null;
  reason?: string;
  send_invitation?: boolean;
  require_2fa: boolean;
}

/** Simple RFC-5321-ish email format check for client-side validation. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInviteInput(input: Partial<InviteUserInput>): { ok: true } | { ok: false; error: string } {
  const email = (input.email ?? "").trim();
  if (!input.first_name?.trim()) return { ok: false, error: "First name is required." };
  if (!input.last_name?.trim())  return { ok: false, error: "Last name is required." };
  if (!email)                    return { ok: false, error: "Work email is required." };
  if (!EMAIL_RE.test(email))     return { ok: false, error: "Enter a valid work email." };
  if (!input.department)         return { ok: false, error: "Department is required." };
  if (!input.primary_role)       return { ok: false, error: "Primary role is required." };
  const roles = input.roles ?? [];
  const check = validateRoleSet(roles);
  if (!check.ok) return { ok: false, error: check.error ?? "Invalid role selection." };
  const requiresApproval = roles.some(isProtectedRole);
  if (requiresApproval && !input.reason?.trim()) {
    return { ok: false, error: "A reason is required for privileged roles." };
  }
  return { ok: true };
}

/** Returns true when the email is already in use by an internal user. */
export async function checkEmailAvailability(email: string): Promise<{ available: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { available: true };
  const { data, error } = await supabase
    .from("internal_users")
    .select("id")
    .ilike("email", clean)
    .limit(1);
  if (error) return { available: true };
  return { available: (data?.length ?? 0) === 0 };
}

/** Reporting-manager options — admin-tier active users only. */
export async function fetchReportingManagerOptions(): Promise<Array<{
  id: string; full_name: string; role: InternalRoleKey | null;
}>> {
  const [usersRes, rolesRes] = await Promise.all([
    supabase.from("internal_users").select("id,full_name,status").eq("status", "active"),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
  ]);
  if (usersRes.error) return [];
  const primaryByUser = new Map<string, InternalRoleKey>();
  for (const r of rolesRes.data ?? []) {
    if (r.is_primary) primaryByUser.set(r.user_id, r.role_key as InternalRoleKey);
  }
  const ADMIN_TIER: InternalRoleKey[] = [
    "super_admin", "senior_admin", "dispute_manager", "finance_approver", "compliance_officer",
  ];
  return (usersRes.data ?? [])
    .map((u: any) => ({
      id: u.id as string,
      full_name: u.full_name as string,
      role: primaryByUser.get(u.id) ?? null,
    }))
    .filter((u) => !u.role || ADMIN_TIER.includes(u.role))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function inviteInternalUser(input: InviteUserInput): Promise<InternalUser> {
  const check = validateRoleSet(input.roles);
  if (!check.ok) throw new Error(check.error);
  const { data, error } = await supabase.functions.invoke("admin-invite-internal-user", { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data.user as InternalUser;
}

// ---------- Access change requests ----------

export async function listAccessChangeRequests(status: "pending" | "all" = "pending"): Promise<AccessChangeRequest[]> {
  const q = supabase
    .from("access_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data, error } = status === "pending" ? await q.eq("status", "pending") : await q;
  if (error) throw error;

  const rows = data ?? [];
  const ids = Array.from(new Set(rows.flatMap((r: any) => [r.requested_by, r.target_user_id]).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
    for (const p of profs ?? []) names.set(p.id, p.full_name ?? "");
    const { data: ius } = await supabase.from("internal_users").select("id,full_name").in("id", ids);
    for (const p of ius ?? []) names.set(p.id, p.full_name ?? "");
  }

  return rows.map((r: any): AccessChangeRequest => ({
    id: r.id,
    target_user_id: r.target_user_id,
    target_name: names.get(r.target_user_id) ?? null,
    requested_by: r.requested_by,
    requested_by_name: names.get(r.requested_by) ?? null,
    change_type: r.change_type,
    payload: r.payload ?? {},
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    review_reason: r.review_reason,
    created_at: r.created_at,
  }));
}

export async function reviewAccessChangeRequest(id: string, decision: "approve" | "reject", reason: string): Promise<void> {
  const requester = await currentUserId();
  const { data: req, error: fetchErr } = await supabase
    .from("access_change_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  if (req.status !== "pending") throw new Error("Request already reviewed.");
  if (req.requested_by === requester) throw new Error("You cannot approve your own request.");

  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const { error: updErr } = await supabase
    .from("access_change_requests")
    .update({ status: nextStatus, reviewed_by: requester, reviewed_at: new Date().toISOString(), review_reason: reason })
    .eq("id", id);
  if (updErr) throw updErr;

  if (decision === "approve" && req.change_type === "role") {
    const payload = req.payload as { roles: InternalRoleKey[]; primary_role: InternalRoleKey };
    // Apply immediately, bypassing the protected-role queue by calling as super_admin.
    await updateUserRoles({
      user_id: req.target_user_id,
      roles: payload.roles,
      primary_role: payload.primary_role,
      reason: `Approved change request: ${reason}`,
    });
  }

  await auditLog(req.target_user_id, `access_change_${decision}d`,
    `${decision === "approve" ? "Approved" : "Rejected"} access change request`,
    decision === "approve" ? "warning" : "info",
    { request_id: id, reason });
}

// ---------- Presentation helpers ----------

export const STATUS_LABEL: Record<InternalUserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  pending_approval: "Pending Approval",
  invited: "Invited",
  locked: "Locked",
  deactivated: "Deactivated",
};

export function accessDotClass(level: AccessLevel): string {
  switch (level) {
    case "full": return "bg-red-400";
    case "high": return "bg-amber-400";
    case "standard": return "bg-blue-400";
    case "limited": return "bg-emerald-400";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Back-compat export used by some legacy imports.
export const PERMISSION_CATALOG = PERMISSION_MODULES.map((m) => ({
  group: m.label,
  items: m.permissions.map((p) => ({ key: p.key, label: p.label })),
}));