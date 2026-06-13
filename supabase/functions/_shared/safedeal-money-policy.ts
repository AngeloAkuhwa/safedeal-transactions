/**
 * SafeDeal Money Policy — single source of truth for the Nigeria MVP.
 *
 * Rules (final, see plan.md):
 *  - Combined service-fee cap: ₦2,500 covers SafeDeal Fee + Payment Processing Fee.
 *  - Provider (Paystack) fee is covered first inside the cap.
 *  - SafeDeal earns the remainder inside the cap.
 *  - Seller payout = item amount (no seller-side commission for MVP).
 *  - Payment Processing Fee is non-refundable once payment has been processed.
 *  - Frontend NEVER recomputes seller payout or final refund amount.
 */

import { computePricing as computeRawPricing, type PricingResult as RawPricing } from "./pricing.ts";

export const PRICING_MODEL_VERSION = "NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1" as const;
export const MAX_TOTAL_SERVICE_FEE = 2500;

export interface PricingSnapshot {
  /** Item / listing price (₦). */
  item_amount: number;
  /** SafeDeal Fee — what SafeDeal earns, after provider fee is covered, inside the cap. */
  safedeal_fee_amount: number;
  /** Payment Processing Fee — provider (Paystack) fee, covered first inside the cap. */
  payment_processing_fee_amount: number;
  /** Total Service Fee = safedeal_fee_amount + payment_processing_fee_amount, capped at ₦2,500. */
  service_fee_amount: number;
  /** Total Charged = item_amount + service_fee_amount. */
  total_amount: number;
  /** Amount the seller receives on release. MVP rule: = item_amount. */
  seller_payout_amount: number;
  /** Currency code (NGN for MVP). */
  currency: string;
  /** True when raw_total_service_fee was clipped by MAX_TOTAL_SERVICE_FEE. */
  is_total_service_fee_capped: boolean;
  /** Stamp the model version so we can evolve pricing without rewriting history. */
  pricing_model_version: typeof PRICING_MODEL_VERSION;
}

/**
 * Build the canonical pricing snapshot. Wraps `_shared/pricing.ts` (which
 * already implements the tiered + capped math) and exposes the additional
 * derived fields that downstream code reads.
 *
 * `computeRawPricing` already returns `service_fee_amount` = the capped
 * combined fee and `paystack_fee_amount` = the provider fee BEFORE the cap.
 * The cap-split rule (provider first) is applied here so every caller agrees.
 */
export function buildPricingSnapshot(itemAmount: number, currency: string = "NGN"): PricingSnapshot {
  const raw: RawPricing = computeRawPricing(itemAmount, currency);

  const provider_fee_estimate = raw.paystack_fee_amount;
  const service_fee_amount = raw.service_fee_amount;
  const payment_processing_fee_amount = Math.min(provider_fee_estimate, service_fee_amount);
  const safedeal_fee_amount = Math.max(service_fee_amount - payment_processing_fee_amount, 0);

  return {
    item_amount: raw.item_amount,
    safedeal_fee_amount,
    payment_processing_fee_amount,
    service_fee_amount,
    total_amount: raw.total_amount,
    seller_payout_amount: raw.item_amount, // MVP rule
    currency: raw.currency_code,
    is_total_service_fee_capped: raw.is_capped,
    pricing_model_version: PRICING_MODEL_VERSION,
  };
}

/**
 * Re-derive a snapshot from a row already persisted in `transaction_pricing`,
 * so consumers don't recompute math against the policy. Used to surface a
 * canonical shape to callers that only have the persisted row.
 */
export function snapshotFromPersisted(row: {
  item_amount: number | string | null;
  paystack_fee_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  payment_processing_fee_amount?: number | string | null;
  safedeal_fee_amount?: number | string | null;
  service_fee_amount?: number | string | null;
  total_amount?: number | string | null;
  seller_payout_amount?: number | string | null;
  currency_code?: string | null;
  is_total_service_fee_capped?: boolean | null;
  pricing_model_version?: string | null;
}): PricingSnapshot | null {
  const item = num(row.item_amount);
  if (item == null) return null;

  const service =
    num(row.service_fee_amount) ?? 0;
  const provider =
    num(row.payment_processing_fee_amount) ?? num(row.paystack_fee_amount) ?? 0;
  const safedeal =
    num(row.safedeal_fee_amount) ?? num(row.platform_fee_amount) ?? Math.max(service - provider, 0);
  const total = num(row.total_amount) ?? item + service;
  const sellerPayout = num(row.seller_payout_amount) ?? item;

  return {
    item_amount: item,
    safedeal_fee_amount: safedeal,
    payment_processing_fee_amount: provider,
    service_fee_amount: service,
    total_amount: total,
    seller_payout_amount: sellerPayout,
    currency: row.currency_code ?? "NGN",
    is_total_service_fee_capped: Boolean(row.is_total_service_fee_capped) || service >= MAX_TOTAL_SERVICE_FEE,
    pricing_model_version: (row.pricing_model_version as typeof PRICING_MODEL_VERSION) ?? PRICING_MODEL_VERSION,
  };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/* ============================================================
 * Forbidden / required display labels (single source of truth)
 * ============================================================ */

export const REQUIRED_PRICING_LABELS = {
  item_amount: "Item Total",
  safedeal_fee_amount: "SafeDeal Fee",
  payment_processing_fee_amount: "Payment Processing Fee",
  service_fee_amount: "Total Service Fee",
  total_amount: "Total Charged",
  seller_payout_amount: "Seller Payout",
} as const;

export const PRICING_HELPER_COPY = {
  safedeal_fee_amount:
    "SafeDeal Fee helps secure the transaction, support dispute review, and release funds only when the deal is completed safely.",
  payment_processing_fee_amount:
    "Payment Processing Fee covers the cost of processing your online payment. This fee is non-refundable once payment has been processed.",
  service_fee_amount:
    "SafeDeal keeps the total service fee capped at ₦2,500 for Nigeria MVP.",
} as const;

export const FORBIDDEN_LABELS = [
  "Delivery Fee",
  "Shipping Fee",
  "Platform Processing Fee",
  "Protection & Processing Fee",
  "USD",
  "$",
] as const;