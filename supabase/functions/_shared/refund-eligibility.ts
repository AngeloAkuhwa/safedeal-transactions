/**
 * Central refund-eligibility evaluator + decision object.
 *
 * Returns the canonical `refund_decision` shape that admin/refund UIs read.
 * Backend remains final authority. The DB RPC `start_refund_atomic`
 * enforces the refund⟂payout mutex; this module powers preview + CTA state.
 *
 * MVP rule: Payment Processing Fee is non-refundable once payment has been
 * processed. Seller-fault default refunds Item Total + SafeDeal Fee.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { snapshotFromPersisted } from "./safedeal-money-policy.ts";

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

const GATE_LABELS: Record<RefundGateId, string> = {
  payment_succeeded: "Payment has succeeded",
  not_already_refunded: "Not already fully refunded",
  payout_not_in_flight: "Payout not currently processing",
  payout_not_completed: "Payout not yet completed",
  no_seller_transfer_in_flight: "No seller transfer in flight",
  refund_not_pending: "No refund already pending",
  admin_permission: "Admin has refund permission",
  provider_reference_present: "Provider payment reference present",
  amount_within_refundable: "Refund amount within refundable balance",
};

const IN_FLIGHT_PAYOUT = new Set(["pending", "processing"]);
const IN_FLIGHT_REFUND = new Set(["pending", "processing", "awaiting_provider"]);

export async function evaluateRefundEligibility(
  admin: SupabaseClient,
  args: {
    transaction_id: string;
    admin_user_id: string;
    outcome?: RefundOutcome;
  },
): Promise<RefundDecision> {
  const { transaction_id, admin_user_id, outcome = "unspecified" } = args;

  const [txRes, payRes, payoutRes, refundRes, pricingRes, permRes] = await Promise.all([
    admin
      .from("transactions")
      .select("id, status, money_status")
      .eq("id", transaction_id)
      .maybeSingle(),
    admin
      .from("payments")
      .select("id, status, provider_reference, amount")
      .eq("transaction_id", transaction_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("payouts")
      .select("id, status, release_blocked")
      .eq("transaction_id", transaction_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("refunds")
      .select("id, status, amount")
      .eq("transaction_id", transaction_id),
    admin
      .from("transaction_pricing")
      .select(
        "item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount, payment_processing_fee_amount, seller_payout_amount, currency_code, is_total_service_fee_capped, pricing_model_version",
      )
      .eq("transaction_id", transaction_id)
      .maybeSingle(),
    admin.rpc("has_role", { _user_id: admin_user_id, _role: "super_admin" }),
  ]);

  const payment = payRes.data as any;
  const payout = payoutRes.data as any;
  const refunds = (refundRes.data ?? []) as Array<{ status: string; amount: number | string }>;
  const snapshot = snapshotFromPersisted((pricingRes.data ?? {}) as any);
  const hasPermission = Boolean((permRes as any)?.data);

  const paymentProcessed = payment?.status === "succeeded";
  const totalRefunded = refunds
    .filter((r) => r.status === "completed" || r.status === "issued" || r.status === "succeeded")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  const refundableCeiling = snapshot
    ? Math.max(snapshot.item_amount + snapshot.safedeal_fee_amount - totalRefunded, 0)
    : 0;

  // Policy default amounts by outcome
  let refund_item_amount = 0;
  let refund_safedeal_fee_amount = 0;
  const refund_payment_processing_fee_amount = 0; // non-refundable once charged
  let seller_release_amount = 0;
  let seller_payout_cancelled = false;
  let reason: string | null = null;

  if (snapshot) {
    switch (outcome) {
      case "seller_fault":
      case "platform_fault":
      case "buyer_post_payment_cancel": {
        refund_item_amount = snapshot.item_amount;
        refund_safedeal_fee_amount = snapshot.safedeal_fee_amount;
        seller_payout_cancelled = true;
        reason =
          outcome === "seller_fault"
            ? "Seller at fault: buyer refunded item amount + SafeDeal fee. Processing fee non-refundable."
            : outcome === "platform_fault"
              ? "Platform fault: buyer refunded item amount + SafeDeal fee. Processing fee non-refundable by default."
              : "Buyer cancelled after payment; seller had not yet acted.";
        break;
      }
      case "buyer_early_cancel": {
        // No charge / full reversal where possible
        reason = "Buyer cancelled before payment was processed.";
        break;
      }
      case "buyer_late_cancel":
      case "partial_dispute": {
        // Admin-decided; default to 0 and let admin override
        reason = "Outcome requires admin-decided amount.";
        break;
      }
      case "buyer_loses_dispute": {
        // No refund; seller can be paid if eligibility passes
        seller_release_amount = snapshot.seller_payout_amount;
        reason = "Buyer lost dispute; no refund issued.";
        break;
      }
      default:
        reason = "Outcome not specified.";
    }
  }

  const refund_amount =
    refund_item_amount + refund_safedeal_fee_amount + refund_payment_processing_fee_amount;

  const gates: RefundGate[] = [
    {
      id: "payment_succeeded",
      label: GATE_LABELS.payment_succeeded,
      pass: paymentProcessed,
    },
    {
      id: "not_already_refunded",
      label: GATE_LABELS.not_already_refunded,
      pass: snapshot ? totalRefunded < snapshot.item_amount + snapshot.safedeal_fee_amount : false,
    },
    {
      id: "payout_not_in_flight",
      label: GATE_LABELS.payout_not_in_flight,
      pass: !IN_FLIGHT_PAYOUT.has(payout?.status),
    },
    {
      id: "payout_not_completed",
      label: GATE_LABELS.payout_not_completed,
      pass: payout?.status !== "completed",
    },
    {
      id: "no_seller_transfer_in_flight",
      label: GATE_LABELS.no_seller_transfer_in_flight,
      pass: !IN_FLIGHT_PAYOUT.has(payout?.status),
    },
    {
      id: "refund_not_pending",
      label: GATE_LABELS.refund_not_pending,
      pass: !refunds.some((r) => IN_FLIGHT_REFUND.has(r.status)),
    },
    {
      id: "admin_permission",
      label: GATE_LABELS.admin_permission,
      pass: hasPermission,
    },
    {
      id: "provider_reference_present",
      label: GATE_LABELS.provider_reference_present,
      pass: Boolean(payment?.provider_reference),
    },
    {
      id: "amount_within_refundable",
      label: GATE_LABELS.amount_within_refundable,
      pass: refund_amount <= refundableCeiling + 0.001,
      detail: `cap=${refundableCeiling}`,
    },
  ];

  const firstBlocker = gates.find((g) => !g.pass)?.id ?? null;
  const refund_allowed =
    gates.every((g) => g.pass) &&
    outcome !== "buyer_loses_dispute" &&
    refund_amount > 0;

  return {
    transaction_id,
    refund_allowed,
    refund_amount,
    refund_item_amount,
    refund_safedeal_fee_amount,
    refund_payment_processing_fee_amount,
    payment_processing_fee_non_refundable: paymentProcessed,
    seller_payout_cancelled,
    seller_release_amount,
    reason,
    outcome,
    decided_by: admin_user_id,
    decision_source: "policy_default",
    first_blocker: firstBlocker,
    gates,
  };
}
/**
 * Pure mirror of the DB rule implemented by
 * `public.ensure_platform_fee_reversal` + `start_refund_atomic`.
 *
 * Escrow only holds the item amount; the SafeDeal platform fee is booked as a
 * `fee_record`. A seller/platform-fault refund returns item + platform fee, so
 * the excess above the available pool is reversed back in as an `adjustment`
 * (capped at the platform fee still un-reversed). The payment processing fee
 * is never refundable.
 *
 * Amounts are in minor units (kobo) to keep the arithmetic exact.
 */
export function planPlatformFeeReversal(args: {
  requiredMinor: number;
  availableMinor: number;
  platformFeeBookedMinor: number;
  alreadyReversedMinor?: number;
}): { reversalMinor: number; availableAfterMinor: number; accepted: boolean } {
  const { requiredMinor, availableMinor, platformFeeBookedMinor } = args;
  const alreadyReversedMinor = args.alreadyReversedMinor ?? 0;

  if (requiredMinor <= 0) {
    return { reversalMinor: 0, availableAfterMinor: availableMinor, accepted: false };
  }
  if (requiredMinor <= availableMinor) {
    return { reversalMinor: 0, availableAfterMinor: availableMinor, accepted: true };
  }

  const excess = requiredMinor - availableMinor;
  const remainingFee = Math.max(platformFeeBookedMinor - alreadyReversedMinor, 0);
  if (excess > remainingFee) {
    // Cannot refund more than item + platform fee out of escrow.
    return { reversalMinor: 0, availableAfterMinor: availableMinor, accepted: false };
  }

  return {
    reversalMinor: excess,
    availableAfterMinor: availableMinor + excess,
    accepted: true,
  };
}
