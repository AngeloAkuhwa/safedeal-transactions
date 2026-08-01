import { supabase } from "@/integrations/supabase/client";
import { getExportStatus, type ExportJob } from "@/services/admin-escrow.service";

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
  public_user_id?: string | null;
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

export interface AuditFacetActor {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
}
export interface AuditFacets {
  action_types: string[];
  actors: AuditFacetActor[];
}

export async function fetchAuditFacets(): Promise<AuditFacets> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-audit-logs?action=facets`, {
    method: "GET",
    headers: await authHeader(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "failed_to_load_audit_facets");
  return json;
}

/**
 * Trigger the compliance report edge function, poll the resulting export job,
 * and resolve to a signed download URL.
 */
export async function runComplianceReport(
  range: "24h" | "7d" | "30d" | "90d" = "30d",
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<{ url: string; job: ExportJob; from: string; to: string }> {
  const pollMs = opts.pollMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const { data, error } = await supabase.functions.invoke("admin-audit-compliance-report", {
    body: { range },
  });
  if (error) throw new Error(error.message);
  const jobId = (data as { job_id?: string }).job_id;
  const from = (data as { from?: string }).from ?? "";
  const to = (data as { to?: string }).to ?? "";
  if (!jobId) throw new Error("compliance_report_enqueue_failed");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const { job, download_url } = await getExportStatus(jobId);
    if (job.status === "completed" && download_url) return { url: download_url, job, from, to };
    if (job.status === "failed" || job.status === "expired") {
      throw new Error(job.error_message ?? `Compliance report ${job.status}`);
    }
  }
  throw new Error("Compliance report timed out");
}