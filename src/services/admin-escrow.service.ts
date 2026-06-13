import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export type EscrowRecordState = "held" | "frozen" | "pending_release" | "released" | "refunded";

export interface EscrowKpis {
  total_held: number; total_held_count: number; total_held_delta_pct: number;
  total_frozen: number; total_frozen_count: number; total_frozen_delta_pct: number;
  pending_release: number; pending_release_count: number; pending_release_delta_pct: number;
  total_refunded: number; total_refunded_count: number; total_refunded_delta_pct: number;
  released_today: number; released_today_count: number; released_today_delta_pct: number;
  released_week: number; released_week_count: number; released_week_delta_pct: number;
}

export interface EscrowTrends {
  balance_30d: { date: string; balance: number }[];
  state_distribution: { state: string; value: number }[];
  flow_14d: { date: string; held: number; released: number; refunded: number }[];
}

export interface EscrowAlerts {
  frozen_too_long: { tx_id: string; code: string; amount: number; days_frozen: number }[];
  provider_mismatch: { tx_id: string; code: string; delta: number }[];
  high_value_held: { tx_id: string; code: string; amount: number; held_for: number }[];
  dispute_stalled: { tx_id: string; code: string; stalled_for: number }[];
  counts: { critical: number; warning: number };
}

export interface EscrowRecordRow {
  transaction_id: string;
  transaction_code: string;
  created_at: string;
  money_status: string;
  buyer: { name: string; avatar_url: string | null };
  seller: { name: string; avatar_url: string | null };
  total_held: number;
  frozen: number;
  releasable: number;
  state: EscrowRecordState;
  last_changed_at: string;
  flagged: boolean;
}

export interface EscrowOverview {
  kpis: EscrowKpis;
  trends: EscrowTrends;
  alerts: EscrowAlerts;
  records: { total: number; page: number; page_size: number; rows: EscrowRecordRow[] };
}

export interface EscrowQuery {
  state?: "all" | EscrowRecordState;
  date_range?: "today" | "7d" | "30d" | "all";
  amount_bucket?: "any" | "lt_1k" | "1k_10k" | "gt_10k";
  flag?: "all" | "disputed" | "high_value";
  q?: string;
  page?: number;
  page_size?: number;
}

export async function fetchEscrowOverview(query: EscrowQuery = {}): Promise<EscrowOverview> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }

  const res = await fetch(`${FN_BASE}/admin-escrow-overview?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as EscrowOverview;
}