/**
 * Payment-flow client gateway.
 *
 * Single import surface for any screen that needs pricing, payment
 * initiation, refund decision, or payout eligibility. Internally calls the
 * existing edge functions / RPCs; future Phase 3 wiring will route these
 * through the new shared policy modules on the backend.
 *
 * Frontend must NEVER recompute seller payout or final refund amount.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  PricingSnapshot,
  PricingSnapshotView,
  PayoutEligibility,
  RefundDecision,
  RefundOutcome,
} from "@/types/payment-flow.types";
import { PRICING_MODEL_VERSION } from "@/types/payment-flow.types";

/**
 * Build a canonical PricingSnapshot from a persisted `transaction_pricing`
 * row. Tolerant of legacy rows that don't yet have the new derived columns.
 */
export function snapshotFromRow(row: Record<string, unknown> | null | undefined): PricingSnapshot | null {
  if (!row) return null;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : null;
  };
  const item = num(row.item_amount);
  if (item == null) return null;
  // Real DB columns: platform_fee_amount, processing_fee_amount,
  // seller_net_amount, buyer_total_amount. Migration 018 will add
  // payment_processing_fee_amount and seller_payout_amount as derived columns.
  const provider =
    num(row.payment_processing_fee_amount) ?? num(row.processing_fee_amount) ?? 0;
  const safedeal = num(row.platform_fee_amount) ?? 0;
  const service = provider + safedeal;
  const total = num(row.buyer_total_amount) ?? item + service;
  const sellerPayout = num(row.seller_payout_amount) ?? item;
  return {
    item_amount: item,
    safedeal_fee_amount: safedeal,
    payment_processing_fee_amount: provider,
    service_fee_amount: service,
    total_amount: total,
    seller_payout_amount: sellerPayout,
    currency: (row.currency_code as string) ?? "NGN",
    is_total_service_fee_capped:
      Boolean(row.is_total_service_fee_capped) || service >= 2500,
    pricing_model_version:
      ((row.pricing_model_version as string) as typeof PRICING_MODEL_VERSION) ??
      PRICING_MODEL_VERSION,
  };
}

/** Fetch the persisted snapshot for a transaction. */
export async function getPricingSnapshot(transactionId: string): Promise<PricingSnapshot | null> {
  const { data, error } = await supabase
    .from("transaction_pricing")
    .select(
      "item_amount, platform_fee_amount, processing_fee_amount, payment_processing_fee_amount, seller_net_amount, seller_payout_amount, buyer_total_amount, currency_code, is_total_service_fee_capped, pricing_model_version",
    )
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (error) throw error;
  return snapshotFromRow(data as unknown as Record<string, unknown> | null);
}

/**
 * Adapt a `PricingSnapshot` (where every field is required and numeric) into
 * the looser `PricingSnapshotView` shape consumed by `<PricingBreakdown>` and
 * `<SellerPayoutLine>`. Pass-through; no math.
 */
export function toBuyerBreakdown(
  snapshot: PricingSnapshot | null | undefined,
  opts?: { isEstimate?: boolean },
): PricingSnapshotView | null {
  if (!snapshot) return null;
  return {
    item_amount: snapshot.item_amount,
    safedeal_fee_amount: snapshot.safedeal_fee_amount,
    payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
    service_fee_amount: snapshot.service_fee_amount,
    total_amount: snapshot.total_amount,
    seller_payout_amount: snapshot.seller_payout_amount,
    currency: snapshot.currency,
    is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
    is_estimate: opts?.isEstimate ?? false,
  };
}

/**
 * Build a `PricingSnapshotView` directly from a raw `transaction_pricing`
 * row (or an `agreement_snapshot.pricing` JSONB). Preserves NULLs so locked
 * legacy rows render `—` for the lines that were never stamped.
 */
export function viewFromRow(
  row: Record<string, unknown> | null | undefined,
  opts?: { isEstimate?: boolean },
): PricingSnapshotView | null {
  if (!row) return null;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : null;
  };
  const item = num(row.item_amount);
  const safedeal = num(row.platform_fee_amount) ?? num(row.safedeal_fee_amount);
  const processing =
    num(row.payment_processing_fee_amount) ?? num(row.processing_fee_amount);
  const service =
    num(row.service_fee_amount) ??
    (safedeal != null && processing != null ? safedeal + processing : null);
  const total = num(row.buyer_total_amount) ?? num(row.total_amount);
  const sellerPayout =
    num(row.seller_payout_amount) ?? num(row.seller_net_amount);
  return {
    item_amount: item,
    safedeal_fee_amount: safedeal,
    payment_processing_fee_amount: processing,
    service_fee_amount: service,
    total_amount: total,
    seller_payout_amount: sellerPayout,
    currency: (row.currency_code as string) ?? (row.currency as string) ?? "NGN",
    is_total_service_fee_capped:
      Boolean(row.is_total_service_fee_capped) ||
      (service != null && service >= 2500),
    is_estimate: opts?.isEstimate ?? false,
  };
}

/** Initiate a Paystack payment via the existing edge function. */
export async function initiatePayment(args: {
  shareToken: string;
  paymentMethod: "card" | "bank";
}): Promise<{
  access_code: string;
  authorization_url: string;
  reference: string;
  public_key: string;
  email: string;
  amount: number;
}> {
  const { data, error } = await supabase.functions.invoke("initiate-paystack-payment", {
    body: args,
  });
  if (error) throw error;
  return data;
}

/** Verify a Paystack payment via the existing edge function. */
export async function verifyPayment(reference: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("verify-paystack-payment", {
    body: { reference },
  });
  if (error) throw error;
  return data;
}

/**
 * Placeholder for Phase 3 edge fn `evaluate-payout-eligibility`. For now,
 * callers can still hit the existing admin payouts detail endpoint and map
 * its `gates`/`first_blocker` fields into PayoutEligibility client-side.
 */
export async function getPayoutEligibility(
  _args: { transaction_id: string; payout_id?: string },
): Promise<PayoutEligibility | null> {
  return null;
}

/**
 * Placeholder for Phase 3 edge fn `evaluate-refund-eligibility`. Real wiring
 * lands when `refund-transaction` is refactored to return the central
 * `refund_decision` object.
 */
export async function getRefundDecision(
  _args: { transaction_id: string; outcome?: RefundOutcome },
): Promise<RefundDecision | null> {
  return null;
}