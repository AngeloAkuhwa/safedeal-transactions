/**
 * SafeDeal Money Policy: single source of truth for the Nigeria MVP.
 *
 * Rules (final, see plan.md):
 *  - Combined service-fee cap: the `pricing.max_total_service_fee_ngn` platform
 *    setting covers SafeDeal Fee + Payment Processing Fee. Never restate the
 *    number here: it is configuration, not copy.
 *  - Provider (Paystack) fee is covered first inside the cap.
 *  - SafeDeal earns the remainder inside the cap.
 *  - Seller payout = item amount (no seller-side commission for MVP).
 *  - Payment Processing Fee is non-refundable once payment has been processed.
 *  - Frontend NEVER recomputes seller payout or final refund amount.
 */

import { computePricing as computeRawPricing, type PricingResult as RawPricing, type PricingConfigOverride } from "./pricing.ts";

/**
 * Default version stamp used when there is no vendor-scoped config override.
 * Config-aware callers should prefer {@link computePricingModelVersion}, which
 * derives a version tag from the effective config so persisted rows remain
 * distinguishable across cap / floor / tier changes.
 */
export const PRICING_MODEL_VERSION_DEFAULT = "NG_G3_PLATFORM_FEE_2PCT_PLUS_100_CAP_5000_V1" as const;
/** @deprecated Prefer {@link PRICING_MODEL_VERSION_DEFAULT}. Kept for source compat. */
export const PRICING_MODEL_VERSION = PRICING_MODEL_VERSION_DEFAULT;
/**
 * Legacy fallback ceiling used only for consumers that lack a persisted
 * snapshot boolean. Runtime pricing math reads the effective cap from
 * `PricingConfigOverride` (see `_shared/pricing.ts`), not this constant.
 */
export const MAX_TOTAL_SERVICE_FEE_FALLBACK = 7000;

/**
 * Compute a config-aware version stamp. Format:
 *   `NG_MVP_TSFCAP_<cap>_PFCAP_<platformCap>_MIN_<floor>_T<tierHash>`
 * where `tierHash` is a short deterministic digest of the effective tier
 * rates. Persisted alongside snapshots so audit tooling can detect the exact
 * pricing rules that produced any historical row. Both ceilings are stamped so
 * the UI can name *which* cap bound a charge (see `resolveAppliedCap`).
 */
export function computePricingModelVersion(config?: PricingConfigOverride): string {
  if (!config) return PRICING_MODEL_VERSION_DEFAULT;
  const cap = config.max_total_service_fee ?? MAX_TOTAL_SERVICE_FEE_FALLBACK;
  const min = config.min_platform_fee ?? 250;
  const rate = config.platform_fee_rate ?? 0.02;
  const flat = config.platform_fee_flat ?? 100;
  const platformCap = config.max_platform_fee ?? 5000;
  const tiersJson = JSON.stringify({ t: config.tier_rates ?? [], rate, flat, platformCap });
  let hash = 0;
  for (let i = 0; i < tiersJson.length; i++) {
    hash = ((hash << 5) - hash + tiersJson.charCodeAt(i)) | 0;
  }
  const tierHash = (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
  return `NG_MVP_TSFCAP_${cap}_PFCAP_${platformCap}_MIN_${min}_T${tierHash}`;
}

export interface PricingSnapshot {
  /** Item / listing price (₦). */
  item_amount: number;
  /** SafeDeal Fee: what SafeDeal earns, after provider fee is covered, inside the cap. */
  safedeal_fee_amount: number;
  /** Payment Processing Fee: provider (Paystack) fee, covered first inside the cap. */
  payment_processing_fee_amount: number;
  /** Total Service Fee = safedeal_fee_amount + payment_processing_fee_amount, capped by config. */
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
  pricing_model_version: string;
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
export function buildPricingSnapshot(
  itemAmount: number,
  currency: string = "NGN",
  config?: PricingConfigOverride,
): PricingSnapshot {
  const raw: RawPricing = computeRawPricing(itemAmount, currency, "local", config);

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
    pricing_model_version: computePricingModelVersion(config),
  };
}

/**
 * Re-derive a snapshot from a row already persisted in `transaction_pricing`,
 * so consumers don't recompute math against the policy. Used to surface a
 * canonical shape to callers that only have the persisted row.
 *
 * Real DB column names (transaction_pricing), post-Phase-7:
 *   item_amount, platform_fee_amount, payment_processing_fee_amount,
 *   seller_payout_amount, buyer_total_amount, currency_code,
 *   is_total_service_fee_capped, pricing_model_version.
 */
export function snapshotFromPersisted(row: {
  item_amount: number | string | null;
  platform_fee_amount?: number | string | null;
  buyer_total_amount?: number | string | null;
  payment_processing_fee_amount?: number | string | null;
  seller_payout_amount?: number | string | null;
  currency_code?: string | null;
  is_total_service_fee_capped?: boolean | null;
  pricing_model_version?: string | null;
}): PricingSnapshot | null {
  const item = num(row.item_amount);
  if (item == null) return null;

  const provider = num(row.payment_processing_fee_amount) ?? 0;
  const safedeal = num(row.platform_fee_amount) ?? 0;
  const service = provider + safedeal;
  const total = num(row.buyer_total_amount) ?? item + service;
  // MVP rule: seller payout = item amount.
  const sellerPayout = num(row.seller_payout_amount) ?? item;

  return {
    item_amount: item,
    safedeal_fee_amount: safedeal,
    payment_processing_fee_amount: provider,
    service_fee_amount: service,
    total_amount: total,
    seller_payout_amount: sellerPayout,
    currency: row.currency_code ?? "NGN",
    // Trust the persisted flag: it was computed against the effective cap
    // for the vendor at write time. Avoid re-evaluating against a global
    // constant, which would be wrong for vendors with custom caps.
    is_total_service_fee_capped: Boolean(row.is_total_service_fee_capped),
    pricing_model_version: row.pricing_model_version ?? PRICING_MODEL_VERSION_DEFAULT,
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
    "SafeDeal caps the total service fee. The cap that applied to this transaction is stamped on its pricing snapshot.",
} as const;

export const FORBIDDEN_LABELS = [
  "Delivery Fee",
  "Shipping Fee",
  "Platform Processing Fee",
  "Protection & Processing Fee",
  "USD",
  "$",
] as const;