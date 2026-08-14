import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export type SnapshotState =
  | "snapshot_complete"
  | "snapshot_missing";

export type ReconciliationStatus =
  | "ok"
  | "drift"
  | "missing_ledger"
  | "missing_pricing";

export interface DriftRow {
  id: string;
  transaction_id: string;
  transaction_code: string | null;
  money_status_live: string | null;
  run_id: string;
  run_at: string;
  paystack_collected: number;
  /** Currency these balances are denominated in; null when unknown. */
  currency_code: string | null;
  paystack_paid_out: number;
  paystack_refunded: number;
  ledger_balance: number;
  expected_ledger_balance: number;
  delta: number;
  status: ReconciliationStatus;
  detail: Record<string, unknown>;
}

export interface CoverageRow {
  snapshot_state: SnapshotState;
  total_count: number;
  last_30d_count: number;
  last_90d_count: number;
}

export interface PricingAuditRow {
  transaction_id: string;
  transaction_code: string;
  money_status: string;
  created_at: string;
  pricing_model_version: string | null;
  snapshot_state: SnapshotState;
}

export interface ReconciliationOverview {
  latest_run: { run_id: string; run_at: string } | null;
  drift: DriftRow[];
  coverage: CoverageRow[];
  pricing_audit: PricingAuditRow[];
  /** Canonical financial remediation report (same routine as Dashboard/Escrow). */
  remediation?: RemediationReport;
}

export type RecordFinancialStatus =
  | "reconciled"
  | "pending_settlement"
  | "mismatch"
  | "requires_review";

export interface RemediationFinding {
  key: string;
  label: string;
  cause: string;
  action: string;
}

export interface RemediationRow {
  transaction_id: string;
  transaction_code: string;
  currency: string;
  money_status: string;
  created_at: string;
  captured: number;
  escrowed: number;
  refunded: number;
  released: number;
  payout_approved: number;
  remaining: number;
  ledger_balance: number;
  expected_balance: number;
  difference: number;
  status: RecordFinancialStatus;
  issues: string[];
  findings: RemediationFinding[];
}

export interface RemediationReport {
  summary: {
    reconciled: number;
    pending_settlement: number;
    mismatch: number;
    requires_review: number;
    total: number;
  };
  rows: RemediationRow[];
  issue_catalog: Record<string, { label: string; cause: string; action: string }>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

export async function fetchReconciliationOverview(): Promise<ReconciliationOverview> {
  const res = await fetch(`${FN_BASE}/admin-reconciliation`, {
    method: "GET",
    headers: await authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return body as ReconciliationOverview;
}

/** Manual run trigger (admin-only). Calls the reconcile-escrow function. */
export async function triggerReconciliationRun(lookbackHours = 24): Promise<{ run_id: string; considered: number; drift_count: number }> {
  const res = await fetch(`${FN_BASE}/reconcile-escrow`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ lookback_hours: lookbackHours }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return body as { run_id: string; considered: number; drift_count: number };
}