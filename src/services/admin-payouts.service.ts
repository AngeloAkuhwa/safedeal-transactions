import { supabase } from "@/integrations/supabase/client";
import type { PayoutAccountState } from "@/types/payment-flow.types";

export type { PayoutAccountState };

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(init.headers as Record<string, string> | undefined ?? {}) };
  const res = await fetch(`${FN_BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export type PayoutTab = "all" | "pending_release" | "blocked" | "processing" | "completed" | "failed" | "reversed" | "on_hold" | "stuck";

export interface PayoutSummary {
  currency: string;
  summary: {
    pending_release: { count: number; amount: number; delta_24h?: number };
    processing: { count: number; amount: number; delta_24h?: number };
    failed: { count: number; amount: number; delta_24h?: number };
    released_today: { amount: number; count?: number };
    released_week: { amount: number; count?: number };
    avg_release_hours: number | null;
    stuck?: { count: number; amount: number; threshold_hours: number };
  };
  tab_counts: Record<PayoutTab, number> & { all: number };
  paystack_balance: { ok: boolean; available?: number; currency?: string; error?: string };
}

export interface PayoutRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  release_blocked: boolean;
  payout_blocked_reason: string | null;
  retry_allowed: boolean;
  failed_attempt_count: number;
  failure_reason: string | null;
  provider_reference: string | null;
  entered_queue_at: string;
  released_at: string | null;
  initiated_at: string | null;
  is_stuck?: boolean;
  stuck_hours?: number;
  watchdog_alerted_at?: string | null;
  transaction: {
    id: string;
    code: string;
    money_status: string | null;
    status: string | null;
    dispute_status: string | null;
    needs_release_review: boolean;
    item_title: string | null;
    refund_in_flight: boolean;
  };
  seller: { id: string; name: string; email: string | null; avatar_url: string | null };
  payout_account: {
    bank_name: string | null;
    masked_account: string | null;
    account_name: string | null;
    verification_status: string | null;
    has_recipient_code: boolean;
    account_state: PayoutAccountState | null;
  } | null;
  pricing: {
    item_total: number;
    protection_fee: number;
    protection_fee_raw: number;
    protection_fee_capped: boolean;
    payment_processing_fee: number;
    total_charged: number;
    seller_payout: number;
    currency: string;
  };
}

export interface PayoutListResponse {
  rows: PayoutRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface PayoutEligibilityGate {
  key: string;
  label: string;
  pass: boolean;
  actual?: string;
  detail?: string;
}

export interface PayoutTimelineEntry {
  id: string;
  at: string;
  type: string;
  title: string;
  description?: string | null;
  actorType?: string | null;
  actorName?: string | null;
  severity?: string | null;
  icon?: string | null;
  subtype?: string | null;
}

export interface PayoutDetail {
  payout: Omit<PayoutRow, "transaction" | "seller" | "payout_account" | "pricing" | "amount" | "currency"> & {
    notes: string | null;
    /** Null when the payout record carries no amount. Never coerced to 0. */
    amount: number | null;
    currency: string | null;
  };
  transaction: PayoutRow["transaction"] & { buyer_id: string; seller_id: string; created_at: string } | null;
  pricing: {
    item_total: number | null;
    protection_fee: number | null;
    protection_fee_raw: number | null;
    protection_fee_capped: boolean;
    payment_processing_fee: number | null;
    total_charged: number | null;
    seller_payout: number | null;
    /** Where the release figure came from. Snapshot is canonical. */
    seller_payout_source?: "pricing_snapshot" | null;
    recorded_payout_amount?: number | null;
    release_amount_mismatch?: boolean;
    currency: string | null;
    has_pricing_snapshot?: boolean;
  };
  seller: { id: string; name: string; email: string | null; avatar_url: string | null } | null;
  payout_account: PayoutRow["payout_account"] & { last_verified_at: string | null } | null;
  payment: any | null;
  refunds: any[];
  dispute: any | null;
  investigation: any | null;
  queue: any[];
  notes: any[];
  events: any[];
  timeline?: PayoutTimelineEntry[];
  eligibility: { gates: PayoutEligibilityGate[]; eligible: boolean };
}

export function getSummary() {
  return call<PayoutSummary>("/admin-payouts-summary", { method: "GET" });
}

export interface PayoutListParams {
  tab?: PayoutTab;
  search?: string;
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  bank_status?: "verified" | "unverified" | "pending";
  quick?: "failed_only" | "blocked_only" | "high_priority";
}

export function listPayouts(params: PayoutListParams = {}) {
  const qs = new URLSearchParams();
  if (params.tab) qs.set("tab", params.tab);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (typeof params.amount_min === "number") qs.set("amount_min", String(params.amount_min));
  if (typeof params.amount_max === "number") qs.set("amount_max", String(params.amount_max));
  if (params.bank_status) qs.set("bank_status", params.bank_status);
  if (params.quick) qs.set("quick", params.quick);
  return call<PayoutListResponse>(`/admin-payouts-list?${qs.toString()}`, { method: "GET" });
}

export function getPayoutDetail(payoutId: string) {
  return call<PayoutDetail>(`/admin-payouts-detail?payout_id=${encodeURIComponent(payoutId)}`, { method: "GET" });
}

export function releasePayout(input: { transaction_id: string; payout_id: string; notes?: string }) {
  return call<{ ok: boolean; status?: string; transfer_reference?: string }>(`/release-payout`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function retryPayout(input: { payout_id: string; notes?: string }) {
  return call<{ ok: boolean }>(`/retry-payout`, { method: "POST", body: JSON.stringify(input) });
}

export function blockPayout(input: { transaction_id: string; payout_id: string; reason: string }) {
  return call<{ ok: boolean }>(`/admin-transaction-actions`, {
    method: "POST",
    body: JSON.stringify({ action: "block_payout", transactionId: input.transaction_id, payload: { payout_id: input.payout_id, reason: input.reason } }),
  });
}

export function unblockPayout(input: { transaction_id: string; payout_id: string; reason: string }) {
  return call<{ ok: boolean }>(`/admin-transaction-actions`, {
    method: "POST",
    body: JSON.stringify({ action: "unblock_payout", transactionId: input.transaction_id, payload: { payout_id: input.payout_id, reason: input.reason } }),
  });
}

export function addInternalNote(input: { transaction_id: string; note: string }) {
  return call<{ ok: boolean }>(`/admin-transaction-actions`, {
    method: "POST",
    body: JSON.stringify({ action: "add_internal_note", transactionId: input.transaction_id, payload: { note: input.note, category: "payout" } }),
  });
}