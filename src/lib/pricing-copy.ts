/**
 * SINGLE SOURCE OF TRUTH for public-facing pricing copy.
 *
 * Every marketing/public surface that names a fee rate, flat amount, cap or
 * add-on price MUST build its strings here. Figures are derived from the LIVE
 * platform config (`public-pricing` edge function → `system_settings`), and
 * `FALLBACK_PRICING_CONFIG` is used only when that read fails.
 *
 * Enforced by `src/__tests__/public-pricing-copy.contract.test.ts`, which
 * fails if a rate, flat amount or cap appears as a numeric literal in a
 * user-facing file.
 */
import { FALLBACK_PRICING_CONFIG, type PricingConfigOverride } from "@/lib/pricing";
import { REFUND_SENTENCE } from "@/lib/payment/fee-policy";
import { formatNaira } from "@/services/vendor-plan.service";

export interface SachetCatalog {
  photo_slots: { amount_naira: number; slots: number; label: string };
  store_boost: { amount_naira: number; days: number; label: string };
}

export const FALLBACK_SACHETS: SachetCatalog = {
  photo_slots: { amount_naira: 1000, slots: 10, label: "+10 showcase slots" },
  store_boost: { amount_naira: 1500, days: 7, label: "Boost my store" },
};

export interface PublicPricingCopy {
  /** Raw derived figures, for callers that must compare against a plan rate. */
  platformFeeRate: number;
  platformFeeFlat: number;
  /** e.g. "2% + ₦100" */
  safedealFeeHeadline: string;
  /** e.g. "₦5,000" */
  safedealFeeCap: string;
  /** e.g. "₦7,000" */
  totalServiceFeeCeiling: string;
  /** Full, honest single-sentence disclosure of what a buyer pays. */
  feeDisclosure: string;
  /** What the seller is charged per completed deal. */
  perDealLine: string;
  refundLine: string;
  metaDescription: string;
  photoSlotsAddon: { price: string; label: string };
  storeBoostAddon: { price: string; label: string; days: number };
}

export function buildPublicPricingCopy(
  config?: PricingConfigOverride | null,
  sachets: SachetCatalog = FALLBACK_SACHETS,
): PublicPricingCopy {
  const rate = config?.platform_fee_rate ?? FALLBACK_PRICING_CONFIG.platform_fee_rate;
  const flat = config?.platform_fee_flat ?? FALLBACK_PRICING_CONFIG.platform_fee_flat;
  const platformCap = config?.max_platform_fee ?? FALLBACK_PRICING_CONFIG.max_platform_fee;
  const totalCap = config?.max_total_service_fee ?? FALLBACK_PRICING_CONFIG.max_total_service_fee;

  const ratePct = `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;
  const headline = `${ratePct} + ${formatNaira(flat)}`;
  const capText = formatNaira(platformCap);
  const ceilingText = formatNaira(totalCap);

  return {
    platformFeeRate: rate,
    platformFeeFlat: flat,
    safedealFeeHeadline: headline,
    safedealFeeCap: capText,
    totalServiceFeeCeiling: ceilingText,
    feeDisclosure:
      `SafeDeal charges ${headline} per completed deal, capped at ${capText}. ` +
      `The payment provider's processing fee is charged on top, and the combined ` +
      `Total Service Fee never exceeds ${ceilingText}.`,
    perDealLine: `${headline} per completed deal: capped at ${capText}`,
    refundLine: REFUND_SENTENCE,
    metaDescription:
      `SafeDeal is free to start: open a store, list products and get paid safely. ` +
      `We only earn when you get paid safely. ${headline} per completed deal, capped at ${capText}.`,
    photoSlotsAddon: {
      price: formatNaira(sachets.photo_slots.amount_naira),
      label: `+${sachets.photo_slots.slots} photo slots`,
    },
    storeBoostAddon: {
      price: formatNaira(sachets.store_boost.amount_naira),
      label: sachets.store_boost.label,
      days: sachets.store_boost.days,
    },
  };
}
