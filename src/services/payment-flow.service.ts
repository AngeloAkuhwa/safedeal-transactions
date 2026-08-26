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
import { reportError, newId } from "@/lib/errorLog";
import type {
  PricingSnapshot,
  PricingSnapshotView,
  PayoutEligibility,
  RefundDecision,
  RefundOutcome,
} from "@/types/payment-flow.types";
import { resolveAppliedCap } from "@/types/payment-flow.types";

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
    // Trust only the persisted flag. Re-deriving it against a hardcoded
    // ceiling was wrong for every vendor with a custom cap.
    is_total_service_fee_capped: Boolean(row.is_total_service_fee_capped),
    pricing_model_version: (row.pricing_model_version as string) ?? null,
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
    applied_cap: resolveAppliedCap({
      pricing_model_version: snapshot.pricing_model_version,
      service_fee_amount: snapshot.service_fee_amount,
      safedeal_fee_amount: snapshot.safedeal_fee_amount,
    }),
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
    is_total_service_fee_capped: Boolean(row.is_total_service_fee_capped),
    applied_cap: resolveAppliedCap({
      pricing_model_version: (row.pricing_model_version as string) ?? null,
      service_fee_amount: service,
      safedeal_fee_amount: safedeal,
    }),
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
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/initiate-paystack-payment`;
  // Minted here and sent as a header the function logs against, so a buyer's
  // "payment could not be initiated" and the server stack for the same
  // attempt join on one id instead of a guess by timestamp. This is the
  // single most valuable place in the product to have that, because it is
  // the one where the buyer cannot tell whether their money moved.
  const correlationId = newId();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": correlationId,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(args),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    // Surface commerce-gate `reason` (checkout_disabled/vendor_disabled/etc.) verbatim.
    const reason = typeof json?.reason === "string" ? json.reason : null;
    const errCode = typeof json?.error === "string" ? json.error : null;
    const message = reason || errCode || `Payment could not be initiated (${res.status})`;
    reportError({
      kind: "payment_initiate_failed",
      message,
      severity: "fatal",
      functionName: "initiate-paystack-payment",
      httpStatus: res.status,
      correlationId,
      context: {
        // A prefix, never the token. `shareToken` authorises payment on a
        // public route, and this row is read by every operator holding
        // platform_configuration.view. Six characters is enough to line the
        // report up against a transaction and not enough to pay with.
        share_token_prefix: args.shareToken.slice(0, 6),
        payment_method: args.paymentMethod,
        signed_in: Boolean(session),
        reason,
      },
    });
    throw new Error(message);
  }
  return json;
}

/** Verify a Paystack payment via the existing edge function. */
export async function verifyPayment(reference: string): Promise<unknown> {
  const correlationId = newId();
  const { data, error } = await supabase.functions.invoke("verify-paystack-payment", {
    body: { reference },
    headers: { "x-correlation-id": correlationId },
  });
  if (error) {
    // A verify that fails is the worst state in the product: Paystack has the
    // money and we do not know it. Logged fatal, with the reference, so the
    // row is enough to reconcile by hand without asking the buyer anything.
    reportError({
      kind: "payment_verify_failed",
      message: error.message || "Payment verification failed",
      severity: "fatal",
      functionName: "verify-paystack-payment",
      correlationId,
      context: { reference },
    });
    throw error;
  }
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