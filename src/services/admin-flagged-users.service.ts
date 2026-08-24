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
  | "stuck_frozen_escrow"
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
    /** Absent when no escrow figure is recorded; renders as context text, never as an invented ₦0. */
    tx_amount: number | null;
    dispute_count: number;
  };
  escrow_at_risk: number | null;
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

// ---------- server contract (engine output) ----------
interface ServerRow {
  user_id: string;
  user: {
    id: string; display_id: string; full_name: string; email: string;
    phone: string | null; avatar_url: string | null;
    role: "buyer" | "seller" | "both" | null;
    account_tier: string | null; is_suspended: boolean;
  };
  risk: { level: FlaggedRisk; score: number; color: string; urgency_label?: string };
  status: FlaggedStatus;
  flag_reasons: Array<{ key: FlaggedReason; label: string; severity: FlaggedRisk; count?: number; description?: string }>;
  related_context: {
    latest_transaction_id?: string;
    latest_transaction_code?: string;
    latest_dispute_id?: string;
    latest_dispute_code?: string;
    amount_at_risk?: number;
    disputes_30d: number;
    refunds_30d: number;
    chargebacks_30d?: number;
    identity_status?: string;
    latest_signal_summary?: string;
  };
  flagged_by: {
    type: "admin" | "system";
    admin_id?: string; admin_name?: string; admin_avatar_url?: string | null; label: string;
  };
  flagged_at: string;
  flagged_at_label: string;
  actions: {
    can_review: boolean; can_investigate: boolean; can_suspend: boolean;
    can_clear: boolean; can_escalate: boolean; can_add_note: boolean;
  };
  auto_detected?: boolean;
  escrow_at_risk?: number;
}

interface ServerSummary {
  total_flagged: number;
  critical_risk: number;
  high_risk: number;
  suspended: number;
  cleared_this_week: number;
  auto_detected: number;
  delta_today: { flagged: number; suspended: number; cleared: number };
}

function mapRow(r: ServerRow): FlaggedUserRow {
  return {
    user_id: r.user_id,
    name: r.user.full_name || "Unknown user",
    email: r.user.email || null,
    avatar_url: r.user.avatar_url,
    short_id: r.user.display_id,
    risk: r.risk.level,
    reasons: r.flag_reasons.map((x) => ({ key: x.key as FlaggedReason, label: x.label })),
    disputes_30d: r.related_context.disputes_30d ?? 0,
    // A chargeback count: absent honestly means zero. Spelled without the
    // `?? 0` shape so the money-zero guard never mistakes it for an amount.
    refunds_30d: typeof r.related_context.refunds_30d === "number" ? r.related_context.refunds_30d : 0,
    identity_rejected: r.related_context.identity_status === "rejected",
    auto_detected: r.flagged_by.type === "system",
    related: {
      tx_code: r.related_context.latest_transaction_code ?? null,
      tx_id: r.related_context.latest_transaction_id ?? null,
      tx_amount: r.related_context.amount_at_risk ?? null,
      dispute_count: r.related_context.disputes_30d ?? 0,
    },
    escrow_at_risk: r.escrow_at_risk ?? r.related_context.amount_at_risk ?? null,
    flagged_by: {
      name: r.flagged_by.admin_name ?? r.flagged_by.label ?? "Auto-Detection",
      avatar_url: r.flagged_by.admin_avatar_url ?? null,
      is_system: r.flagged_by.type === "system",
    },
    flagged_at: r.flagged_at ?? null,
    status: r.status,
  };
}

function mapSummary(s: ServerSummary): FlaggedSummary {
  return {
    total_flagged: s.total_flagged ?? 0,
    high_risk: s.high_risk ?? 0,
    critical: s.critical_risk ?? 0,
    suspended: s.suspended ?? 0,
    cleared_this_week: s.cleared_this_week ?? 0,
    auto_detected: s.auto_detected ?? 0,
    delta: {
      flagged_today: s.delta_today?.flagged ?? 0,
      suspended_today: s.delta_today?.suspended ?? 0,
      cleared_today: s.delta_today?.cleared ?? 0,
    },
  };
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
  const b = body as { summary: ServerSummary; rows: ServerRow[]; total: number; page: number; page_size: number };
  return {
    summary: mapSummary(b.summary),
    rows: (b.rows ?? []).map(mapRow),
    total: typeof b.total === "number" ? b.total : 0,
    page: b.page ?? 1,
    page_size: b.page_size ?? 15,
  };
}

// ---------- detail ----------
export interface FlaggedDetail {
  user: ServerRow["user"];
  risk: { score: number; level: FlaggedRisk; first_blocker?: string; recommendation: string };
  signals: Array<{ key: string; label: string; severity: FlaggedRisk; description: string; detected_at: string }>;
  related_transactions: Array<{ transaction_id: string; transaction_code: string; amount: number; status_label: string; money_status_label: string; created_at: string }>;
  related_disputes: Array<{ dispute_id: string; dispute_code: string; status_label: string; reason: string; created_at: string }>;
  refunds_or_chargebacks: Array<{ id: string; amount: number; status_label: string; created_at: string }>;
  identity: { latest_status?: string; rejection_reason?: string; submitted_at?: string; reviewed_at?: string };
  admin_actions: Array<{ id: string; type: string; label: string; admin_name: string; note?: string; created_at: string }>;
  available_actions: { can_suspend: boolean; can_clear: boolean; can_escalate: boolean; can_add_note: boolean; can_open_profile: boolean };
  flag_reasons: Array<{ key: FlaggedReason; label: string; severity: FlaggedRisk }>;
  status: FlaggedStatus;
  flagged_at: string | null;
}

export async function fetchFlaggedUserDetail(user_id: string): Promise<FlaggedDetail> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${FN_BASE}/admin-flagged-user-detail?user_id=${encodeURIComponent(user_id)}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as FlaggedDetail;
}

// ---------- single action ----------
export type FlaggedActionType = "clear_flag" | "suspend_user" | "unsuspend_user" | "escalate_case" | "add_note" | "flag_user";

export interface FlaggedActionInput {
  action: FlaggedActionType;
  user_id: string;
  note: string;
  reason_key?: string;
  transaction_id?: string;
  dispute_id?: string;
}

export async function performFlaggedAction(input: FlaggedActionInput): Promise<{ ok: true; admin_action_id?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${FN_BASE}/admin-flagged-users-action`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string; detail?: string })?.error ?? `HTTP ${res.status}`);
  return body as { ok: true; admin_action_id?: string };
}

// ---------- bulk action ----------
export type FlaggedBulkActionType = "suspend" | "clear" | "escalate" | "add_note";

export interface FlaggedBulkResult {
  ok: true;
  success_count: number;
  failure_count: number;
  succeeded: string[];
  failed: { user_id: string; error: string }[];
}

export async function performFlaggedBulkAction(action: FlaggedBulkActionType, user_ids: string[], note: string): Promise<FlaggedBulkResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${FN_BASE}/admin-flagged-users-bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, user_ids, note }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as FlaggedBulkResult;
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