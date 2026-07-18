/**
 * SafeDeal Pricing Policy Helper
 *
 * Computes buyer-facing service fees dynamically based on:
 * 1. Paystack's actual local NGN fee rules
 * 2. SafeDeal's tiered service fee policy
 *
 * Definitions:
 * - item_amount: agreed item price BEFORE buyer-facing service fees
 * - service_fee_rate: buyer-facing all-in percentage (backend-owned commercial value)
 * - service_fee_amount: paystack_fee_amount + platform_fee_amount
 *
 * Rules:
 * - SafeDeal platform fee floored at ₦250 (minimum revenue per transaction)
 * - Total service fee capped at ₦2,500 (buyer-friendly ceiling)
 * - Fees are non-refundable
 */

const MIN_PLATFORM_FEE = 250;
const MAX_TOTAL_FEE = 2500;

export interface PricingConfigOverride {
  min_platform_fee?: number;
  max_total_service_fee?: number;
  tier_rates?: Array<{ upto: number | null; rate: number }>;
}

export interface PricingResult {
  currency_code: string;
  item_amount: number;
  paystack_fee_amount: number;
  platform_fee_amount: number;
  service_fee_amount: number;
  service_fee_rate: number;
  total_amount: number;
  is_floored: boolean;
  is_capped: boolean;
  non_refundable: boolean;
}

type PricingMode = "local" | "international";

/**
 * Paystack local NGN fee rules (current as of 2025):
 * - 1.5% + ₦100
 * - ₦100 flat fee waived for transactions under ₦2,500
 * - Local transaction fees capped at ₦2,000
 */
function computePaystackLocalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.015;
  const flatFee = itemAmount < 2500 ? 0 : 100;
  const rawFee = percentageFee + flatFee;
  return Math.min(Math.round(rawFee), 2000);
}

/**
 * Paystack international fee rules (stubbed for future use):
 * - Mastercard/Visa/Verve: 3.9% + ₦100
 */
function computePaystackInternationalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.039;
  const flatFee = 100;
  return Math.round(percentageFee + flatFee);
}

/**
 * SafeDeal buyer-facing tiered service fee rates for local NGN transactions.
 */
function getSafeDealLocalTierRate(itemAmount: number): number {
  if (itemAmount <= 100_000) return 0.039;
  if (itemAmount <= 500_000) return 0.035;
  if (itemAmount <= 2_000_000) return 0.029;
  return 0.025;
}

function tierRateFromConfig(itemAmount: number, tiers: Array<{ upto: number | null; rate: number }>): number {
  for (const t of tiers) {
    if (t.upto == null || itemAmount <= t.upto) return t.rate;
  }
  return tiers[tiers.length - 1]?.rate ?? 0.025;
}

/**
 * Compute full pricing breakdown for a transaction.
 */
export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN",
  mode: PricingMode = "local",
  config?: PricingConfigOverride,
): PricingResult {
  const minPlatformFee = config?.min_platform_fee ?? MIN_PLATFORM_FEE;
  const maxTotalFee = config?.max_total_service_fee ?? MAX_TOTAL_FEE;
  if (itemAmount <= 0) {
    return {
      currency_code: currencyCode,
      item_amount: 0,
      paystack_fee_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 0,
      service_fee_rate: 0,
      total_amount: 0,
      is_floored: false,
      is_capped: false,
      non_refundable: true,
    };
  }

  // Step 1: Compute Paystack fee
  const paystackFee =
    mode === "international"
      ? computePaystackInternationalFee(itemAmount)
      : computePaystackLocalFee(itemAmount);

  // Step 2: Determine SafeDeal target service rate (config-aware)
  const baseTierRate = config?.tier_rates
    ? tierRateFromConfig(itemAmount, config.tier_rates)
    : getSafeDealLocalTierRate(itemAmount);
  const tierRate = mode === "international" ? Math.max(baseTierRate, 0.039) : baseTierRate;

  // Step 3: Platform fee = max(minPlatformFee, tierRate × item - paystackFee)
  const rawPlatformFee = Math.max(minPlatformFee, Math.round(itemAmount * tierRate) - paystackFee);

  // Step 4: Total service fee = min(maxTotalFee, paystackFee + platformFee)
  const rawServiceFee = paystackFee + rawPlatformFee;
  const serviceFeeAmount = Math.min(rawServiceFee, maxTotalFee);

  // Step 5: Recalculate platform fee after cap
  const platformFee = Math.max(serviceFeeAmount - paystackFee, 0);

  const is_floored = rawPlatformFee === minPlatformFee;
  const is_capped = rawServiceFee > maxTotalFee;

  // Step 6: Effective rate
  const serviceFeeRate = serviceFeeAmount / itemAmount;

  return {
    currency_code: currencyCode,
    item_amount: itemAmount,
    paystack_fee_amount: paystackFee,
    platform_fee_amount: platformFee,
    service_fee_amount: serviceFeeAmount,
    service_fee_rate: Math.round(serviceFeeRate * 10000) / 10000,
    total_amount: itemAmount + serviceFeeAmount,
    is_floored,
    is_capped,
    non_refundable: true,
  };
}
