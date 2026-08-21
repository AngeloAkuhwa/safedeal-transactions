/**
 * Single source of truth for payout blocking reasons and in-flight guards.
 *
 * `seller-confirm-completion` writes `payout_account_missing` when a seller
 * has no verified payout account; older rows may carry
 * `payout_account_unverified`. `update-payout-account` self-heals BOTH so the
 * two functions can never drift again.
 */
export const PAYOUT_ACCOUNT_BLOCK_REASONS = [
  "payout_account_missing",
  "payout_account_unverified",
] as const;

export type PayoutAccountBlockReason = (typeof PAYOUT_ACCOUNT_BLOCK_REASONS)[number];

/** release_review_queue.queue_type used for account-missing blocks. */
export const PAYOUT_ACCOUNT_QUEUE_TYPE = "payout_account_missing";

/** Queue rows that are still open and should be resolved on self-heal. */
export const OPEN_RELEASE_REVIEW_STATUSES = ["pending", "claimed", "held"] as const;

/**
 * Payout statuses that represent a genuine in-flight release. Editing the
 * payout account while one of these exists could redirect money to a new
 * (mule) account, so the edit is rejected with 409 payout_in_flight.
 *
 * NOTE: 'blocked' is deliberately NOT here: a seller with a blocked payout
 * MUST be able to add an account in order to unblock it.
 */
export const IN_FLIGHT_PAYOUT_STATUSES = ["pending", "processing", "awaiting_release"] as const;

export function isAccountBlockReason(reason: string | null | undefined): boolean {
  return !!reason && (PAYOUT_ACCOUNT_BLOCK_REASONS as readonly string[]).includes(reason);
}

export function isInFlightPayoutStatus(status: string | null | undefined): boolean {
  return !!status && (IN_FLIGHT_PAYOUT_STATUSES as readonly string[]).includes(status);
}

/** True when the payout-account edit must be rejected with payout_in_flight. */
export function blocksPayoutAccountEdit(
  payouts: Array<{ status?: string | null }> | null | undefined,
): boolean {
  return (payouts ?? []).some((p) => isInFlightPayoutStatus(p?.status));
}
