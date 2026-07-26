// Typed repository seam for the Permission Matrix workspace.
// Every page/drawer talks to this interface instead of Supabase directly, so
// the storage backend can be swapped without touching UI code.

import { supabase } from "@/integrations/supabase/client";
import type { PermissionRiskLevel } from "./permission-catalog";

export interface FeatureRow {
  key: string;
  module: string;
  module_label?: string;
  action: string;
  label: string;
  risk_level: PermissionRiskLevel;
  is_system_default: boolean;
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
}

export interface OverrideRepoRow {
  user_id: string;
  permission_key: string;
  mode: "grant" | "revoke";
  reason: string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
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
}

export interface ChangeSetRow {
  id: string;
  requested_by: string | null;
  target_scope: "role" | "user" | "template";
  target_key: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "applied" | "cancelled";
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
}

export interface PermissionDependencyRow {
  permission_key: string;
  requires_key: string;
  note: string | null;
}

export interface SubmitChangeSetInput {
  target_scope: "role" | "user" | "template";
  target_key: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  role_source?: string | null;
}

export interface PermissionRepository {
  listFeatures(): Promise<FeatureRow[]>;
  listRoles(): Promise<RoleRow[]>;
  listRoleGrants(): Promise<RoleGrantRow[]>;
  listOverrides(): Promise<OverrideRepoRow[]>;
  listTemplates(): Promise<TemplateRow[]>;
  listChangeSets(status?: ChangeSetRow["status"]): Promise<ChangeSetRow[]>;
  listApprovals(): Promise<ApprovalRepoRow[]>;
  listHistory(limit: number, sinceHours?: number, actionTypes?: string[]): Promise<AdminActionHistoryRow[]>;
  listPermissionDependencies(): Promise<PermissionDependencyRow[]>;
  listPermissionConflicts(): Promise<PermissionConflictRow[]>;
  listConflictAcknowledgements(): Promise<ConflictAcknowledgementRow[]>;
  acknowledgeConflict(input: AcknowledgeConflictInput): Promise<void>;
  revokeConflictAcknowledgement(id: string): Promise<void>;
  submitChangeSet(input: SubmitChangeSetInput): Promise<ChangeSetRow>;
  approveChangeSet(id: string, reason?: string | null): Promise<ChangeSetRow>;
  rejectChangeSet(id: string, reason?: string | null): Promise<ChangeSetRow>;
  createTemplate(input: CreateTemplateInput, permissionKeys: string[]): Promise<TemplateRow>;
  updateTemplate(id: string, patch: Partial<CreateTemplateInput>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  setTemplateItems(templateId: string, keys: string[]): Promise<void>;
}

class SupabasePermissionRepository implements PermissionRepository {
  async listFeatures(): Promise<FeatureRow[]> {
    const { data, error } = await supabase
      .from("permissions")
      .select("key,module,action,label,risk_level,is_system_default")
      .order("module")
      .order("action");
    if (error) throw error;
    return (data ?? []) as FeatureRow[];
  }

  async listRoles(): Promise<RoleRow[]> {
    const { data, error } = await supabase
      .from("internal_roles")
      .select("key,name,description,protected,is_system,sort_order")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as RoleRow[];
  }

  async listRoleGrants(): Promise<RoleGrantRow[]> {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("role_key,permission_key");
    if (error) throw error;
    return (data ?? []) as RoleGrantRow[];
  }

  async listOverrides(): Promise<OverrideRepoRow[]> {
    const { data, error } = await supabase
      .from("user_permission_overrides")
      .select("user_id,permission_key,mode,reason,granted_by,granted_at,expires_at")
      .order("granted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OverrideRepoRow[];
  }

  async listTemplates(): Promise<TemplateRow[]> {
    const [tRes, iRes] = await Promise.all([
      supabase.from("permission_templates").select("id,name,description,role_source,created_by,created_at,updated_at").order("name"),
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
    }));
  }

  async listChangeSets(status?: ChangeSetRow["status"]): Promise<ChangeSetRow[]> {
    let q = supabase.from("permission_change_sets").select("*").order("created_at", { ascending: false }).limit(200);
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

  async submitChangeSet(input: SubmitChangeSetInput): Promise<ChangeSetRow> {
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("permission_change_sets")
      .insert({
        target_scope: input.target_scope,
        target_key: input.target_key,
        before: input.before as any,
        after: input.after as any,
        reason: input.reason ?? null,
        requested_by: userRes.user?.id ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as ChangeSetRow;
  }

  async approveChangeSet(id: string, reason?: string | null): Promise<ChangeSetRow> {
    const { data, error } = await supabase.rpc("apply_permission_change_set", {
      _id: id,
      _reason: reason ?? null,
    });
    if (error) throw error;
    return data as unknown as ChangeSetRow;
  }

  async rejectChangeSet(id: string, reason?: string | null): Promise<ChangeSetRow> {
    const { data, error } = await supabase.rpc("reject_permission_change_set", {
      _id: id,
      _reason: reason ?? null,
    });
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
}

export const permissionRepo: PermissionRepository = new SupabasePermissionRepository();