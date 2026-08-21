// Typed repository seam for the Permission Matrix workspace.
// Every page/drawer talks to this interface instead of Supabase directly, so
// the storage backend can be swapped without touching UI code.

import { supabase } from "@/integrations/supabase/client";
import type { PermissionRiskLevel } from "./permission-catalog";

/**
 * Environment scope for all permission-config tables. Every row is written
 * with an environment tag; reads filter to a single environment so admins
 * can experiment in Staging/Dev without polluting Production truth.
 */
export type PermissionEnvironment = "production" | "staging" | "development";

export const DEFAULT_ENVIRONMENT: PermissionEnvironment = "production";

export const PERMISSION_ENVIRONMENTS: readonly PermissionEnvironment[] = [
  "production",
  "staging",
  "development",
];

export interface FeatureRow {
  key: string;
  module: string;
  module_label?: string;
  action: string;
  label: string;
  description?: string;
  risk_level: PermissionRiskLevel;
  is_system_default: boolean;
  status?: "active" | "suspended" | "deprecated";
  approval_required?: boolean;
  owner_role?: string | null;
  updated_at?: string;
  created_at?: string;
}

export interface RoleRow {
  key: string;
  name: string;
  description: string | null;
  protected: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface RoleGrantRow {
  role_key: string;
  permission_key: string;
  environment?: PermissionEnvironment;
}

export interface OverrideRepoRow {
  user_id: string;
  permission_key: string;
  mode: "grant" | "revoke";
  reason: string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  environment?: PermissionEnvironment;
}

export interface ApprovalRepoRow {
  id: string;
  target_user_id: string;
  requested_by: string;
  change_type: string;
  payload: unknown;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface AdminActionHistoryRow {
  id: string;
  admin_user_id: string | null;
  target_user_id: string | null;
  action_type: string;
  action_notes: string | null;
  created_at: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  role_source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  permission_keys: string[];
  is_system?: boolean;
  status?: "active" | "archived";
}

export interface ChangeSetRow {
  id: string;
  requested_by: string | null;
  target_scope: "role" | "user" | "template" | "permission";
  target_key: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  status: "draft" | "pending" | "pending_approval" | "approved" | "rejected" | "applied" | "cancelled" | "requested_changes" | "failed";
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
  submitted_at?: string | null;
  requires_approval?: boolean;
  review_comments?: ReviewComment[] | unknown;
  environment?: PermissionEnvironment;
}

export interface ReviewComment {
  actor: string;
  actor_name?: string | null;
  action: "approved" | "rejected" | "requested_changes" | "commented" | "submitted" | "cancelled";
  comment: string;
  at: string;
}

export interface PermissionDependencyRow {
  permission_key: string;
  requires_key: string;
  note: string | null;
}

export interface PermissionConflictRow {
  a_key: string;
  b_key: string;
  severity: "low" | "medium" | "high" | "critical";
  rationale: string | null;
}

export interface ConflictAcknowledgementRow {
  id: string;
  role_key: string;
  a_key: string;
  b_key: string;
  reason: string;
  actor_id: string;
  created_at: string;
  expires_at: string | null;
  environment?: PermissionEnvironment;
}

export interface AcknowledgeConflictInput {
  role_key: string;
  a_key: string;
  b_key: string;
  reason: string;
  expires_at?: string | null;
  environment?: PermissionEnvironment;
}

export interface SubmitChangeSetInput {
  target_scope: "role" | "user" | "template" | "permission";
  target_key: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
  environment?: PermissionEnvironment;
  requires_approval?: boolean;
  /** Auto-apply immediately when the actor is allowed and no approval is required. */
  autoApply?: boolean;
}

export interface ChangeSetFilter {
  env?: PermissionEnvironment;
  states?: Array<ChangeSetRow["status"]>;
  scope?: ChangeSetRow["target_scope"];
  requestedBy?: string;
  since?: string;
  until?: string;
  limit?: number;
  targetKey?: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  role_source?: string | null;
}

export interface CreateOverrideInput {
  user_id: string;
  permission_key: string;
  mode: "grant" | "revoke";
  reason: string;
  expires_at?: string | null;
  environment?: PermissionEnvironment;
}

export interface PermissionRepository {
  listFeatures(): Promise<FeatureRow[]>;
  listPermissionEnvironments(): Promise<Array<{ permission_key: string; environment: PermissionEnvironment }>>;
  setPermissionEnvironments(key: string, envs: PermissionEnvironment[]): Promise<void>;
  setPermissionDependencies(key: string, requires: string[]): Promise<void>;
  setPermissionConflicts(key: string, entries: Array<{ b_key: string; severity: "low"|"medium"|"high"|"critical"; rationale?: string | null }>): Promise<void>;
  createPermission(input: {
    key: string; module: string; action: string; label: string;
    description: string; risk_level: PermissionRiskLevel;
    approval_required?: boolean; owner_role?: string | null;
    environments?: PermissionEnvironment[];
    dependencies?: string[]; conflicts?: Array<{ b_key: string; severity: "low"|"medium"|"high"|"critical"; rationale?: string | null }>;
  }): Promise<FeatureRow>;
  updatePermission(key: string, patch: {
    label?: string; description?: string; risk_level?: PermissionRiskLevel;
    approval_required?: boolean; owner_role?: string | null;
    status?: "active" | "suspended" | "deprecated";
  }): Promise<void>;
  setPermissionAssignable(key: string, assignable: boolean, reason: string): Promise<void>;
  listRoles(): Promise<RoleRow[]>;
  listRoleGrants(env?: PermissionEnvironment): Promise<RoleGrantRow[]>;
  listOverrides(env?: PermissionEnvironment): Promise<OverrideRepoRow[]>;
  listTemplates(): Promise<TemplateRow[]>;
  listChangeSets(status?: ChangeSetRow["status"], env?: PermissionEnvironment): Promise<ChangeSetRow[]>;
  listApprovals(): Promise<ApprovalRepoRow[]>;
  listHistory(limit: number, sinceHours?: number, actionTypes?: string[]): Promise<AdminActionHistoryRow[]>;
  listPermissionDependencies(): Promise<PermissionDependencyRow[]>;
  listPermissionConflicts(): Promise<PermissionConflictRow[]>;
  listConflictAcknowledgements(env?: PermissionEnvironment): Promise<ConflictAcknowledgementRow[]>;
  acknowledgeConflict(input: AcknowledgeConflictInput): Promise<void>;
  revokeConflictAcknowledgement(id: string): Promise<void>;
  submitChangeSet(input: SubmitChangeSetInput): Promise<ChangeSetRow>;
  submitChangeSets(inputs: SubmitChangeSetInput[]): Promise<ChangeSetRow[]>;
  approveChangeSet(id: string, reason?: string | null, env?: PermissionEnvironment): Promise<ChangeSetRow>;
  rejectChangeSet(id: string, reason?: string | null, env?: PermissionEnvironment): Promise<ChangeSetRow>;
  requestChangesOnChangeSet(id: string, comment: string): Promise<void>;
  cancelChangeSet(id: string, reason?: string | null): Promise<void>;
  listAllChangeSets(filter?: ChangeSetFilter): Promise<ChangeSetRow[]>;
  createTemplate(input: CreateTemplateInput, permissionKeys: string[]): Promise<TemplateRow>;
  updateTemplate(id: string, patch: Partial<CreateTemplateInput>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  setTemplateItems(templateId: string, keys: string[]): Promise<void>;
  archiveTemplate(id: string): Promise<void>;
  cloneTemplate(id: string, newName: string): Promise<TemplateRow>;
  createOverride(input: CreateOverrideInput): Promise<void>;
  extendOverride(user_id: string, permission_key: string, env: PermissionEnvironment, expires_at: string | null): Promise<void>;
  revokeOverride(user_id: string, permission_key: string, env: PermissionEnvironment, reason: string): Promise<void>;
}

class SupabasePermissionRepository implements PermissionRepository {
  async listFeatures(): Promise<FeatureRow[]> {
    const { data, error } = await supabase
      .from("permissions")
      .select("key,module,action,label,description,risk_level,is_system_default,status,approval_required,owner_role,updated_at,created_at")
      .order("module")
      .order("action");
    if (error) throw error;
    return (data ?? []) as FeatureRow[];
  }

  async listPermissionEnvironments(): Promise<Array<{ permission_key: string; environment: PermissionEnvironment }>> {
    const { data, error } = await (supabase as any)
      .from("permission_environments")
      .select("permission_key,environment");
    if (error) throw error;
    return (data ?? []) as Array<{ permission_key: string; environment: PermissionEnvironment }>;
  }

  async setPermissionEnvironments(key: string, envs: PermissionEnvironment[]): Promise<void> {
    const uniq = Array.from(new Set(envs));
    const del = await (supabase as any).from("permission_environments").delete().eq("permission_key", key);
    if (del.error) throw del.error;
    if (uniq.length === 0) return;
    const rows = uniq.map((e) => ({ permission_key: key, environment: e }));
    const ins = await (supabase as any).from("permission_environments").insert(rows);
    if (ins.error) throw ins.error;
  }

  async setPermissionDependencies(key: string, requires: string[]): Promise<void> {
    const del = await (supabase as any).from("permission_dependencies").delete().eq("permission_key", key);
    if (del.error) throw del.error;
    const uniq = Array.from(new Set(requires));
    if (!uniq.length) return;
    const rows = uniq.map((r) => ({ permission_key: key, requires_key: r }));
    const ins = await (supabase as any).from("permission_dependencies").insert(rows);
    if (ins.error) throw ins.error;
  }

  async setPermissionConflicts(
    key: string,
    entries: Array<{ b_key: string; severity: "low"|"medium"|"high"|"critical"; rationale?: string | null }>,
  ): Promise<void> {
    const del = await (supabase as any).from("permission_conflicts").delete().eq("a_key", key);
    if (del.error) throw del.error;
    if (!entries.length) return;
    const rows = entries.map((c) => ({ a_key: key, b_key: c.b_key, severity: c.severity, rationale: c.rationale ?? null }));
    const ins = await (supabase as any).from("permission_conflicts").insert(rows);
    if (ins.error) throw ins.error;
  }

  async createPermission(input: {
    key: string; module: string; action: string; label: string;
    description: string; risk_level: PermissionRiskLevel;
    approval_required?: boolean; owner_role?: string | null;
    environments?: PermissionEnvironment[];
    dependencies?: string[];
    conflicts?: Array<{ b_key: string; severity: "low"|"medium"|"high"|"critical"; rationale?: string | null }>;
  }): Promise<FeatureRow> {
    const { data, error } = await (supabase as any)
      .from("permissions")
      .insert({
        key: input.key,
        module: input.module,
        action: input.action,
        label: input.label,
        description: input.description,
        risk_level: input.risk_level,
        approval_required: input.approval_required ?? false,
        owner_role: input.owner_role ?? null,
        is_system_default: false,
        status: "active",
      })
      .select("key,module,action,label,description,risk_level,is_system_default,status,approval_required,owner_role,updated_at,created_at")
      .single();
    if (error) throw error;
    const envs = input.environments && input.environments.length ? input.environments : (["production","staging","development"] as PermissionEnvironment[]);
    await this.setPermissionEnvironments(input.key, envs);
    if (input.dependencies?.length) {
      const rows = input.dependencies.map((d) => ({ permission_key: input.key, requires_key: d }));
      const dRes = await (supabase as any).from("permission_dependencies").insert(rows);
      if (dRes.error) throw dRes.error;
    }
    if (input.conflicts?.length) {
      const rows = input.conflicts.map((c) => ({ a_key: input.key, b_key: c.b_key, severity: c.severity, rationale: c.rationale ?? null }));
      const cRes = await (supabase as any).from("permission_conflicts").insert(rows);
      if (cRes.error) throw cRes.error;
    }
    return data as FeatureRow;
  }

  async updatePermission(key: string, patch: {
    label?: string; description?: string; risk_level?: PermissionRiskLevel;
    approval_required?: boolean; owner_role?: string | null;
    status?: "active" | "suspended" | "deprecated";
  }): Promise<void> {
    const upd: Record<string, unknown> = {};
    for (const k of ["label","description","risk_level","approval_required","owner_role","status"] as const) {
      if ((patch as any)[k] !== undefined) upd[k] = (patch as any)[k];
    }
    if (Object.keys(upd).length === 0) return;
    const { error } = await (supabase as any).from("permissions").update(upd).eq("key", key);
    if (error) throw error;
  }

  async setPermissionAssignable(key: string, assignable: boolean, reason: string): Promise<void> {
    // Flips permissions.assignable; existing role_permissions and user_permission_overrides
    // are intentionally left in place. Only *new* assignments are blocked.
    const { error } = await (supabase as any)
      .from("permissions")
      .update({ assignable })
      .eq("key", key);
    if (error) throw error;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await (supabase as any).from("admin_actions").insert({
        actor_id: session.user.id,
        action_type: assignable ? "unsuspend_permission_assignment" : "suspend_permission_assignment",
        resource: "permissions",
        resource_id: key,
        metadata: { permission_key: key, assignable, reason },
      });
    }
  }

  async listRoles(): Promise<RoleRow[]> {
    const { data, error } = await supabase
      .from("internal_roles")
      .select("key,name,description,protected,is_system,sort_order")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as RoleRow[];
  }

  async listRoleGrants(env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<RoleGrantRow[]> {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("role_key,permission_key,environment")
      .eq("environment", env);
    if (error) throw error;
    return (data ?? []) as RoleGrantRow[];
  }

  async listOverrides(env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<OverrideRepoRow[]> {
    const { data, error } = await supabase
      .from("user_permission_overrides")
      .select("user_id,permission_key,mode,reason,granted_by,granted_at,expires_at,environment")
      .eq("environment", env)
      .order("granted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OverrideRepoRow[];
  }

  async listTemplates(): Promise<TemplateRow[]> {
    const [tRes, iRes] = await Promise.all([
      supabase.from("permission_templates").select("id,name,description,role_source,created_by,created_at,updated_at,is_system,status").order("name"),
      supabase.from("permission_template_items").select("template_id,permission_key"),
    ]);
    if (tRes.error) throw tRes.error;
    if (iRes.error) throw iRes.error;
    const byId = new Map<string, string[]>();
    for (const row of iRes.data ?? []) {
      const bag = byId.get((row as any).template_id) ?? [];
      bag.push((row as any).permission_key);
      byId.set((row as any).template_id, bag);
    }
    return (tRes.data ?? []).map((t: any) => ({
      id: t.id, name: t.name, description: t.description ?? null,
      role_source: t.role_source ?? null, created_by: t.created_by ?? null,
      created_at: t.created_at, updated_at: t.updated_at,
      permission_keys: byId.get(t.id) ?? [],
      is_system: !!t.is_system,
      status: (t.status ?? "active") as "active" | "archived",
    }));
  }

  async listChangeSets(status?: ChangeSetRow["status"], env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<ChangeSetRow[]> {
    let q = supabase.from("permission_change_sets").select("*").order("created_at", { ascending: false }).limit(200);
    q = q.eq("environment", env);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ChangeSetRow[];
  }

  async listApprovals(): Promise<ApprovalRepoRow[]> {
    const { data, error } = await supabase
      .from("access_change_requests")
      .select("id,target_user_id,requested_by,change_type,payload,reason,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as ApprovalRepoRow[];
  }

  async listHistory(limit: number, sinceHours?: number, actionTypes?: string[]): Promise<AdminActionHistoryRow[]> {
    let q = supabase
      .from("admin_actions")
      .select("id,admin_user_id,target_user_id,action_type,action_notes,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (actionTypes?.length) q = q.in("action_type", actionTypes as any);
    if (sinceHours && sinceHours > 0) {
      const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AdminActionHistoryRow[];
  }

  async listPermissionDependencies(): Promise<PermissionDependencyRow[]> {
    const { data, error } = await (supabase as any)
      .from("permission_dependencies")
      .select("permission_key,requires_key,note");
    if (error) throw error;
    return (data ?? []) as PermissionDependencyRow[];
  }

  async listPermissionConflicts(): Promise<PermissionConflictRow[]> {
    const { data, error } = await (supabase as any)
      .from("permission_conflicts")
      .select("a_key,b_key,severity,rationale")
      .order("a_key");
    if (error) throw error;
    return (data ?? []) as PermissionConflictRow[];
  }

  async listConflictAcknowledgements(env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<ConflictAcknowledgementRow[]> {
    const { data, error } = await (supabase as any)
      .from("permission_conflict_acknowledgements")
      .select("id,role_key,a_key,b_key,reason,actor_id,created_at,expires_at,environment")
      .eq("environment", env)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConflictAcknowledgementRow[];
  }

  async acknowledgeConflict(input: AcknowledgeConflictInput): Promise<void> {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw new Error("Not authenticated");
    const { error } = await (supabase as any)
      .from("permission_conflict_acknowledgements")
      .insert({
        role_key: input.role_key,
        a_key: input.a_key,
        b_key: input.b_key,
        reason: input.reason,
        expires_at: input.expires_at ?? null,
        actor_id: userRes.user.id,
        environment: input.environment ?? DEFAULT_ENVIRONMENT,
      });
    if (error) throw error;
  }

  async revokeConflictAcknowledgement(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("permission_conflict_acknowledgements")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async submitChangeSet(input: SubmitChangeSetInput): Promise<ChangeSetRow> {
    const { data: userRes } = await supabase.auth.getUser();
    const status = input.autoApply && !input.requires_approval ? "draft" : "pending_approval";
    const { data, error } = await supabase
      .from("permission_change_sets")
      .insert({
        target_scope: input.target_scope,
        target_key: input.target_key,
        before: input.before as any,
        after: input.after as any,
        reason: input.reason ?? null,
        requested_by: userRes.user?.id ?? null,
        environment: input.environment ?? DEFAULT_ENVIRONMENT,
        requires_approval: input.requires_approval ?? false,
        status,
        submitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as ChangeSetRow;
  }

  async submitChangeSets(inputs: SubmitChangeSetInput[]): Promise<ChangeSetRow[]> {
    const results: ChangeSetRow[] = [];
    for (const input of inputs) {
      const row = await this.submitChangeSet(input);
      if (input.autoApply && !input.requires_approval) {
        try {
          const applied = await this.approveChangeSet(row.id, input.reason ?? null, input.environment ?? DEFAULT_ENVIRONMENT);
          results.push(applied);
          continue;
        } catch (err) {
          // Best-effort rollback: mark failed so it doesn't linger as draft.
          await (supabase as any)
            .from("permission_change_sets")
            .update({ status: "failed" })
            .eq("id", row.id);
          throw err;
        }
      }
      results.push(row);
    }
    return results;
  }

  async requestChangesOnChangeSet(id: string, comment: string): Promise<void> {
    const { data: userRes } = await supabase.auth.getUser();
    // Append to review_comments and flip to requested_changes/draft
    const { data: current, error: readErr } = await supabase
      .from("permission_change_sets")
      .select("review_comments")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    const list = Array.isArray((current as any)?.review_comments) ? (current as any).review_comments : [];
    list.push({
      actor: userRes.user?.id ?? null,
      action: "requested_changes",
      comment,
      at: new Date().toISOString(),
    });
    const { error } = await (supabase as any)
      .from("permission_change_sets")
      .update({ status: "requested_changes", review_comments: list })
      .eq("id", id);
    if (error) throw error;
  }

  async cancelChangeSet(id: string, reason?: string | null): Promise<void> {
    const { data: userRes } = await supabase.auth.getUser();
    const { data: current, error: readErr } = await supabase
      .from("permission_change_sets")
      .select("review_comments")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    const list = Array.isArray((current as any)?.review_comments) ? (current as any).review_comments : [];
    list.push({
      actor: userRes.user?.id ?? null,
      action: "cancelled",
      comment: reason ?? "",
      at: new Date().toISOString(),
    });
    const { error } = await (supabase as any)
      .from("permission_change_sets")
      .update({ status: "cancelled", review_comments: list })
      .eq("id", id);
    if (error) throw error;
  }

  async listAllChangeSets(filter: ChangeSetFilter = {}): Promise<ChangeSetRow[]> {
    let q = supabase.from("permission_change_sets").select("*")
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.env) q = q.eq("environment", filter.env);
    if (filter.states?.length) q = q.in("status", filter.states as any);
    if (filter.scope) q = q.eq("target_scope", filter.scope);
    if (filter.requestedBy) q = q.eq("requested_by", filter.requestedBy);
    if (filter.targetKey) q = q.eq("target_key", filter.targetKey);
    if (filter.since) q = q.gte("created_at", filter.since);
    if (filter.until) q = q.lte("created_at", filter.until);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ChangeSetRow[];
  }

  async approveChangeSet(id: string, reason?: string | null, env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<ChangeSetRow> {
    const { data, error } = await supabase.rpc("apply_permission_change_set", {
      _id: id,
      _reason: reason ?? null,
      _environment: env,
    } as any);
    if (error) throw error;
    return data as unknown as ChangeSetRow;
  }

  async rejectChangeSet(id: string, reason?: string | null, env: PermissionEnvironment = DEFAULT_ENVIRONMENT): Promise<ChangeSetRow> {
    const { data, error } = await supabase.rpc("reject_permission_change_set", {
      _id: id,
      _reason: reason ?? null,
      _environment: env,
    } as any);
    if (error) throw error;
    return data as unknown as ChangeSetRow;
  }

  async createTemplate(input: CreateTemplateInput, permissionKeys: string[]): Promise<TemplateRow> {
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("permission_templates")
      .insert({
        name: input.name,
        description: input.description ?? null,
        role_source: input.role_source ?? null,
        created_by: userRes.user?.id ?? null,
      })
      .select("id,name,description,role_source,created_by,created_at,updated_at")
      .single();
    if (error) throw error;
    if (permissionKeys.length) {
      await this.setTemplateItems(data.id, permissionKeys);
    }
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      role_source: data.role_source ?? null,
      created_by: data.created_by ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      permission_keys: permissionKeys,
    };
  }

  async updateTemplate(id: string, patch: Partial<CreateTemplateInput>): Promise<void> {
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.description !== undefined) upd.description = patch.description;
    if (patch.role_source !== undefined) upd.role_source = patch.role_source;
    const { error } = await supabase.from("permission_templates").update(upd as any).eq("id", id);
    if (error) throw error;
  }

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase.from("permission_templates").delete().eq("id", id);
    if (error) throw error;
  }

  async setTemplateItems(templateId: string, keys: string[]): Promise<void> {
    const { error } = await supabase.rpc("set_permission_template_items", {
      _template_id: templateId,
      _keys: keys,
    });
    if (error) throw error;
  }

  async archiveTemplate(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("permission_templates")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async cloneTemplate(id: string, newName: string): Promise<TemplateRow> {
    const templates = await this.listTemplates();
    const src = templates.find((t) => t.id === id);
    if (!src) throw new Error("Template not found");
    const created = await this.createTemplate(
      { name: newName, description: src.description, role_source: src.role_source },
      src.permission_keys,
    );
    return created;
  }

  async createOverride(input: CreateOverrideInput): Promise<void> {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("user_permission_overrides")
      .insert({
        user_id: input.user_id,
        permission_key: input.permission_key,
        mode: input.mode,
        reason: input.reason,
        expires_at: input.expires_at ?? null,
        granted_by: userRes.user?.id ?? null,
        environment: input.environment ?? DEFAULT_ENVIRONMENT,
      });
    if (error) throw error;
  }

  async extendOverride(user_id: string, permission_key: string, env: PermissionEnvironment, expires_at: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from("user_permission_overrides")
      .update({ expires_at })
      .eq("user_id", user_id).eq("permission_key", permission_key).eq("environment", env);
    if (error) throw error;
  }

  async revokeOverride(user_id: string, permission_key: string, env: PermissionEnvironment, _reason: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", user_id).eq("permission_key", permission_key).eq("environment", env);
    if (error) throw error;
  }
}

export const permissionRepo: PermissionRepository = new SupabasePermissionRepository();