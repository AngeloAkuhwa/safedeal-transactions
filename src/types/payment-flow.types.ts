/**
 * Shared types for SafeDeal payment flow. Mirrors the backend shapes in
 * `supabase/functions/_shared/safedeal-money-policy.ts`,
 * `payout-eligibility.ts`, and `refund-eligibility.ts`. Keep these in sync.
 */

/**
 * Version stamps are produced by the backend
 * (`supabase/functions/_shared/safedeal-money-policy.ts`) and persisted on
 * every `transaction_pricing` row. The client never invents one, and never
 * hardcodes a cap: the applied ceiling is read back out of the stamp via
 * `appliedCapFromModelVersion`.
 *
 * Current stamp format:
 * `NG_MVP_TSFCAP_<totalServiceFeeCap>_PFCAP_<platformFeeCap>_MIN_<floor>_T<hash>`.
 * Rows written before `PFCAP_` was added carry the total-service-fee ceiling
 * only; the resolver below then declines to name a SafeDeal-fee cap rather
 * than guessing.
 */
export type PricingCapKind = "total_service_fee" | "safedeal_fee";

export interface AppliedFeeCap {
  kind: PricingCapKind;
  amount: number;
}

/** Ceilings recoverable from a persisted pricing-model version stamp. */
export interface PricingCaps {
  total_service_fee: number | null;
  safedeal_fee: number | null;
}

export function parsePricingCaps(version: string | null | undefined): PricingCaps {
  const read = (re: RegExp): number | null => {
    const m = version ? re.exec(version) : null;
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    total_service_fee: read(/TSFCAP_(\d+(?:\.\d+)?)/),
    safedeal_fee: read(/PFCAP_(\d+(?:\.\d+)?)/),
  };
}

/**
 * Name the ceiling that actually bound a persisted breakdown, and its amount
 *: the same two facts `describeFeeBreakdown` reports from `capped_by` /
 * `applied_cap_amount`. Returns `null` when the binding ceiling cannot be
 * identified, so the UI states that a cap applied without naming a number.
 *
 * The total-service-fee ceiling is applied last in `computePricing`, so when
 * both could bind it is the one that produced the charged figure.
 */
export function resolveAppliedCap(input: {
  pricing_model_version?: string | null;
  service_fee_amount?: number | null;
  safedeal_fee_amount?: number | null;
}): AppliedFeeCap | null {
  const caps = parsePricingCaps(input.pricing_model_version);
  const service = input.service_fee_amount;
  const safedeal = input.safedeal_fee_amount;
  if (caps.total_service_fee != null && service != null && service >= caps.total_service_fee) {
    return { kind: "total_service_fee", amount: caps.total_service_fee };
  }
  if (caps.safedeal_fee != null && safedeal != null && safedeal >= caps.safedeal_fee) {
    return { kind: "safedeal_fee", amount: caps.safedeal_fee };
  }
  return null;
}

/**
 * Canonical payout-account readiness states. Source of truth is the
 * `v_payout_account_state` DB view (migration 018). UI badges must map
 * 1-to-1 from these values; never re-derive readiness from raw
 * `payout_accounts` columns on the client.
 */
export type PayoutAccountState =
  | "no_account"
  | "unverified"
  | "verified_no_recipient"
  | "verified_ready";

/**
 * Shape consumed by `<PricingBreakdown>`. Mirrors `PricingSnapshot` with
 * nullable fields for streaming/loading states.
 */
export interface PricingSnapshotView {
  item_amount: number | null;
  safedeal_fee_amount: number | null;
  payment_processing_fee_amount: number | null;
  service_fee_amount: number | null;
  total_amount: number | null;
  seller_payout_amount: number | null;
  currency: string;
  is_total_service_fee_capped: boolean;
  /**
   * The ceiling that actually bound this breakdown, and which ceiling it was.
   * `null` when the applied cap is unknown (legacy rows with no version stamp)
   *: the UI then states that a cap applied without inventing an amount.
   */
  applied_cap: AppliedFeeCap | null;
  is_estimate?: boolean;
}

export interface PricingSnapshot {
  item_amount: number;
  safedeal_fee_amount: number;
  payment_processing_fee_amount: number;
  service_fee_amount: number;
  total_amount: number;
  seller_payout_amount: number;
  currency: string;
  is_total_service_fee_capped: boolean;
  pricing_model_version: string | null;
}

export type PayoutGateId =
  | "money_status_pending_release"
  | "no_active_dispute"
  | "no_open_investigation"
  | "no_release_review"
  | "payout_status_awaiting_release"
  | "payout_not_blocked"
  | "payout_account_verified"
  | "provider_recipient_present"
  | "no_refund_in_flight"
  | "payout_not_already_processing"
  | "admin_permission";

export interface PayoutGate {
  id: PayoutGateId;
  label: string;
  pass: boolean;
  detail?: string;
}

export interface PayoutEligibility {
  payout_id: string | null;
  transaction_id: string;
  can_release: boolean;
  can_retry: boolean;
  can_block: boolean;
  can_unblock: boolean;
  can_refund: boolean;
  first_blocker: PayoutGateId | null;
  gates: PayoutGate[];
}

export type RefundOutcome =
  | "seller_fault"
  | "platform_fault"
  | "buyer_early_cancel"
  | "buyer_post_payment_cancel"
  | "buyer_late_cancel"
  | "buyer_loses_dispute"
  | "partial_dispute"
  | "unspecified";

export type RefundGateId =
  | "payment_succeeded"
  | "not_already_refunded"
  | "payout_not_in_flight"
  | "payout_not_completed"
  | "no_seller_transfer_in_flight"
  | "refund_not_pending"
  | "admin_permission"
  | "provider_reference_present"
  | "amount_within_refundable";

export interface RefundGate {
  id: RefundGateId;
  label: string;
  pass: boolean;
  detail?: string;
}

export interface RefundDecision {
  transaction_id: string;
  refund_allowed: boolean;
  refund_amount: number;
  refund_item_amount: number;
  refund_safedeal_fee_amount: number;
  refund_payment_processing_fee_amount: number;
  payment_processing_fee_non_refundable: boolean;
  seller_payout_cancelled: boolean;
  seller_release_amount: number;
  reason: string | null;
  outcome: RefundOutcome;
  decided_by: string | null;
  decision_source: "policy_default" | "admin_override";
  first_blocker: RefundGateId | null;
  gates: RefundGate[];
}