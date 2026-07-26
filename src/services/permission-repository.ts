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

export interface SubmitChangeSetInput {
  target_scope: "role" | "user" | "template";
  target_key: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
}

export interface PermissionRepository {
  listFeatures(): Promise<FeatureRow[]>;
  listRoles(): Promise<RoleRow[]>;
  listRoleGrants(): Promise<RoleGrantRow[]>;
  listOverrides(): Promise<OverrideRepoRow[]>;
  listTemplates(): Promise<TemplateRow[]>;
  listChangeSets(status?: ChangeSetRow["status"]): Promise<ChangeSetRow[]>;
  submitChangeSet(input: SubmitChangeSetInput): Promise<ChangeSetRow>;
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
}

export const permissionRepo: PermissionRepository = new SupabasePermissionRepository();