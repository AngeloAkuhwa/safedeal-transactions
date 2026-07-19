import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AuditActor {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
}
export interface AuditTarget {
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  transaction_id: string | null;
  dispute_id: string | null;
}
export interface AuditRow {
  id: string;
  created_at: string;
  action_type: string;
  action_label: string;
  severity: AuditSeverity;
  actor: AuditActor;
  target: AuditTarget;
  description: string;
  reason: string | null;
  changed_keys: string[];
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  user_agent: string | null;
}
export interface AuditListResponse {
  rows: AuditRow[];
  total: number;
  page: number;
  page_size: number;
}
export interface AuditStats {
  total_entries: number;
  high_severity: number;
  active_admins: number;
  storage_bytes: number;
  latest_entry_at: string | null;
}

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface AuditListFilters {
  q?: string;
  action_type?: string;
  actor_id?: string;
  severity?: AuditSeverity | "all";
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export async function fetchAuditLogs(filters: AuditListFilters = {}): Promise<AuditListResponse> {
  const qs = new URLSearchParams({ action: "list" });
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    qs.set(k, String(v));
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-audit-logs?${qs.toString()}`, {
    method: "GET",
    headers: await authHeader(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "failed_to_load_audit_logs");
  return json;
}

export async function fetchAuditStats(): Promise<AuditStats> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-audit-logs?action=stats`, {
    method: "GET",
    headers: await authHeader(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "failed_to_load_audit_stats");
  return json;
}