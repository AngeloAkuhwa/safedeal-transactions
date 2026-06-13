/**
 * Shared types for SafeDeal payment flow. Mirrors the backend shapes in
 * `supabase/functions/_shared/safedeal-money-policy.ts`,
 * `payout-eligibility.ts`, and `refund-eligibility.ts`. Keep these in sync.
 */

export const PRICING_MODEL_VERSION = "NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1" as const;
export const MAX_TOTAL_SERVICE_FEE = 2500;

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
 * Shape consumed by `<PricingBreakdown>`. Mirrors `PricingSnapshot` but
 * keeps every field nullable so locked legacy rows can render `—` for
 * the lines that were never stamped.
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
  pricing_model_version: typeof PRICING_MODEL_VERSION;
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