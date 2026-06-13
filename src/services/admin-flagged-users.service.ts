import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export type FlaggedRisk = "critical" | "high" | "medium" | "low";
export type FlaggedStatus = "active" | "under_review" | "suspended" | "resolved";
export type FlaggedReason =
  | "multiple_disputes"
  | "chargeback_pattern"
  | "identity_issues"
  | "suspicious_activity"
  | "fraud_detection"
  | "stuck_escrow"
  | "admin_flag";

export interface FlaggedUserRow {
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  short_id: string;
  risk: FlaggedRisk;
  reasons: { key: FlaggedReason; label: string }[];
  disputes_30d: number;
  refunds_30d: number;
  identity_rejected: boolean;
  auto_detected: boolean;
  related: {
    tx_code: string | null;
    tx_id: string | null;
    tx_amount: number;
    dispute_count: number;
  };
  escrow_at_risk: number;
  flagged_by: { name: string; avatar_url: string | null; is_system: boolean };
  flagged_at: string | null;
  status: FlaggedStatus;
}

export interface FlaggedSummary {
  total_flagged: number;
  high_risk: number;
  critical: number;
  suspended: number;
  cleared_this_week: number;
  auto_detected: number;
  delta: { flagged_today: number; suspended_today: number; cleared_today: number };
}

export interface FlaggedQuery {
  risk?: "all" | FlaggedRisk;
  reason?: "all" | FlaggedReason;
  range?: "today" | "7d" | "30d" | "all";
  status?: "all" | FlaggedStatus;
  q?: string;
  sort?: "risk" | "recent";
  page?: number;
  page_size?: number;
}

export interface FlaggedOverview {
  summary: FlaggedSummary;
  rows: FlaggedUserRow[];
  total: number;
  page: number;
  page_size: number;
}

function toParams(q: FlaggedQuery): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    p.set(k, String(v));
  }
  return p;
}

export async function fetchFlaggedUsers(query: FlaggedQuery = {}): Promise<FlaggedOverview> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${FN_BASE}/admin-flagged-users?${toParams(query).toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as FlaggedOverview;
}

export async function exportFlaggedUsersCsv(query: FlaggedQuery = {}): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const params = toParams(query);
  params.delete("page");
  params.delete("page_size");
  const res = await fetch(`${FN_BASE}/admin-flagged-users-export?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return await res.blob();
}