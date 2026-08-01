/**
 * Single reconciliation implementation shared by the Dashboard, the Escrow
 * page, the Reconciliation hub and the hourly job. All of them call the same
 * database routine (`admin_financial_reconciliation`) so counts can never
 * disagree between screens.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ReconciliationRecordStatus =
  | "reconciled"
  | "pending_settlement"
  | "mismatch"
  | "requires_review";

export interface ReconciliationRow {
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
  status: ReconciliationRecordStatus;
  issues: string[];
}

export interface ReconciliationSummary {
  reconciled: number;
  pending_settlement: number;
  mismatch: number;
  requires_review: number;
  total: number;
}

export const EMPTY_SUMMARY: ReconciliationSummary = {
  reconciled: 0, pending_settlement: 0, mismatch: 0, requires_review: 0, total: 0,
};

/** Human-readable explanation + recommended action per detected issue. */
export const ISSUE_CATALOG: Record<string, { label: string; cause: string; action: string }> = {
  missing_ledger: {
    label: "No ledger entries for a captured payment",
    cause: "Payment succeeded but the escrow deposit was never recorded.",
    action: "Replay the payment webhook to write the missing deposit entries.",
  },
  ledger_split_mismatch: {
    label: "Deposit does not split into fees + escrow",
    cause: "The recorded payment credit does not equal fee records plus the escrow hold.",
    action: "Post a reviewed adjustment entry so the split balances.",
  },
  capture_ledger_mismatch: {
    label: "Captured amount differs from ledger credit",
    cause: "Provider capture and the recorded credit disagree.",
    action: "Re-verify the payment with the provider before adjusting.",
  },
  over_disbursed: {
    label: "Released or refunded more than escrow held",
    cause: "A release debited the buyer's total charge instead of the seller release amount.",
    action: "Reverse the excess with an adjustment entry and re-post the correct release amount.",
  },
  release_amount_mismatch: {
    label: "Approved release differs from actual payout",
    cause: "The ledger release amount and the payout record do not match.",
    action: "Confirm the provider transfer amount, then correct the record that is wrong.",
  },
  escrow_state_drift: {
    label: "Escrow balance differs from the ledger",
    cause: "The escrow aggregate was updated outside the ledger.",
    action: "Recalculate the escrow aggregate from the ledger after review.",
  },
  escrow_released_drift: {
    label: "Escrow shows released funds with no completed payout",
    cause: "Escrow was marked released at approval time instead of on payout completion.",
    action: "Reset the released amount to the completed payout total.",
  },
  payout_missing_completion_timestamp: {
    label: "Completed payout has no completion time",
    cause: "The completion webhook did not record a timestamp.",
    action: "Backfill the timestamp from the provider transfer record.",
  },
  duplicate_ledger_entries: {
    label: "Duplicate ledger movements",
    cause: "The same payment, payout or refund was recorded more than once.",
    action: "Void the duplicate entries after confirming only one movement occurred.",
  },
};

export async function fetchReconciliationRows(
  admin: SupabaseClient,
  opts: { since?: string | null; onlyIssues?: boolean } = {},
): Promise<ReconciliationRow[]> {
  const { data, error } = await admin.rpc("admin_financial_reconciliation", {
    _since: opts.since ?? null,
    _only_issues: opts.onlyIssues ?? false,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReconciliationRow[]).map((r) => ({
    ...r,
    captured: Number(r.captured ?? 0),
    escrowed: Number(r.escrowed ?? 0),
    refunded: Number(r.refunded ?? 0),
    released: Number(r.released ?? 0),
    payout_approved: Number(r.payout_approved ?? 0),
    remaining: Number(r.remaining ?? 0),
    ledger_balance: Number(r.ledger_balance ?? 0),
    expected_balance: Number(r.expected_balance ?? 0),
    difference: Number(r.difference ?? 0),
    issues: r.issues ?? [],
  }));
}

export async function fetchReconciliationSummary(
  admin: SupabaseClient,
  since?: string | null,
): Promise<ReconciliationSummary> {
  const { data, error } = await admin.rpc("admin_financial_reconciliation_summary", {
    _since: since ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Partial<ReconciliationSummary> | null;
  if (!row) return { ...EMPTY_SUMMARY };
  return {
    reconciled: Number(row.reconciled ?? 0),
    pending_settlement: Number(row.pending_settlement ?? 0),
    mismatch: Number(row.mismatch ?? 0),
    requires_review: Number(row.requires_review ?? 0),
    total: Number(row.total ?? 0),
  };
}

/**
 * The one number both the Dashboard card and the Escrow page display.
 * Mismatches plus records explicitly requiring review.
 */
export function outstandingCount(summary: ReconciliationSummary): number {
  return summary.mismatch + summary.requires_review;
}

/** Remediation view: current vs calculated vs difference + recommended action. */
export interface RemediationRow extends ReconciliationRow {
  findings: Array<{ key: string; label: string; cause: string; action: string }>;
}

export function toRemediationRows(rows: ReconciliationRow[]): RemediationRow[] {
  return rows
    .filter((r) => r.status === "mismatch" || r.status === "requires_review")
    .map((r) => ({
      ...r,
      findings: r.issues.map((key) => ({
        key,
        label: ISSUE_CATALOG[key]?.label ?? key,
        cause: ISSUE_CATALOG[key]?.cause ?? "Unclassified discrepancy.",
        action: ISSUE_CATALOG[key]?.action ?? "Investigate manually.",
      })),
    }));
}