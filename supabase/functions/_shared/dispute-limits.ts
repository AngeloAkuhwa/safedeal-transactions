/**
 * Single source of truth for buyer dispute limits.
 * Used by `buyer-disputes` (display) and `transaction-verify` (enforcement)
 * so the displayed cap and the enforced cap can never drift.
 */

export const MAX_OPEN_DISPUTES_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 1,
  trusted_buyer: 3,
  high_trust_buyer: 5,
};

/** Dispute statuses that count as "still open" against the cap. */
export const OPEN_DISPUTE_STATUSES = [
  "open",
  "seller_response_pending",
  "under_review",
  "escalated",
] as const;

export function maxOpenDisputesForLevel(level: string | null | undefined): number {
  return MAX_OPEN_DISPUTES_BY_LEVEL[level ?? "unverified"] ?? 0;
}

export function isOpenDisputeStatus(status: string | null | undefined): boolean {
  return (OPEN_DISPUTE_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export function countOpenDisputes(rows: Array<{ status?: string | null }>): number {
  return rows.filter((r) => isOpenDisputeStatus(r.status)).length;
}

/** True when the buyer is at or above the cap for their verification level. */
export function isAtOpenDisputeCap(level: string | null | undefined, openCount: number): boolean {
  return openCount >= maxOpenDisputesForLevel(level);
}

/**
 * Recourse rule: a buyer may still raise a dispute after
 * verification_deadline_at as long as the case is unresolved and the money is
 * still held in escrow. There is no automatic release job. Funds only move
 * after manual SafeDeal review: so the buyer must never lose recourse in the
 * window between the deadline and that review.
 */
export function isDisputeStillAllowed(tx: {
  status?: string | null;
  money_status?: string | null;
  dispute_status?: string | null;
}): boolean {
  const reviewableStatuses = ["delivered_awaiting_verification", "under_review"];
  if (!reviewableStatuses.includes(String(tx.status ?? ""))) return false;
  if (tx.money_status !== "funds_held_in_escrow") return false;
  const ds = String(tx.dispute_status ?? "none");
  return ds === "none" || ds === "";
}
