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
 */

export interface PricingResult {
  currency_code: string;
  item_amount: number;
  paystack_fee_amount: number;
  platform_fee_amount: number;
  service_fee_amount: number;
  service_fee_rate: number;
  total_amount: number;
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
  // Local transactions capped at ₦2,000
  return Math.min(Math.round(rawFee), 2000);
}

/**
 * Paystack international fee rules (stubbed for future use):
 * - Mastercard/Visa/Verve: 3.9% + ₦100
 * - AmEx: 4.5% (not implemented yet, defaults to 3.9% + ₦100)
 */
function computePaystackInternationalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.039;
  const flatFee = 100;
  return Math.round(percentageFee + flatFee);
}

/**
 * SafeDeal buyer-facing tiered service fee rates for local NGN transactions.
 * The rate decreases as transaction size increases.
 */
function getSafeDealLocalTierRate(itemAmount: number): number {
  if (itemAmount <= 100_000) return 0.039;
  if (itemAmount <= 500_000) return 0.035;
  if (itemAmount <= 2_000_000) return 0.029;
  return 0.025;
}

/**
 * Compute full pricing breakdown for a transaction.
 *
 * @param itemAmount - Agreed item price before buyer-facing fees
 * @param currencyCode - Currency code (default: "NGN")
 * @param mode - "local" or "international" (default: "local")
 */
export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN",
  mode: PricingMode = "local"
): PricingResult {
  if (itemAmount <= 0) {
    return {
      currency_code: currencyCode,
      item_amount: 0,
      paystack_fee_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 0,
      service_fee_rate: 0,
      total_amount: 0,
    };
  }

  // Step 1: Compute Paystack fee
  const paystackFee =
    mode === "international"
      ? computePaystackInternationalFee(itemAmount)
      : computePaystackLocalFee(itemAmount);

  // Step 2: Determine SafeDeal target service rate
  // For international, use 3.9% minimum (must cover higher Paystack fee)
  const tierRate =
    mode === "international"
      ? Math.max(getSafeDealLocalTierRate(itemAmount), 0.039)
      : getSafeDealLocalTierRate(itemAmount);

  // Step 3: Compute target service fee amount
  const targetServiceFee = Math.round(itemAmount * tierRate);

  // Step 4: Split — platform gets remainder after Paystack
  const platformFee = Math.max(targetServiceFee - paystackFee, 0);

  // Step 5: Final service fee = Paystack + platform
  const serviceFeeAmount = paystackFee + platformFee;

  // Step 6: Effective rate
  const serviceFeeRate = serviceFeeAmount / itemAmount;

  return {
    currency_code: currencyCode,
    item_amount: itemAmount,
    paystack_fee_amount: paystackFee,
    platform_fee_amount: platformFee,
    service_fee_amount: serviceFeeAmount,
    service_fee_rate: Math.round(serviceFeeRate * 10000) / 10000, // 4 decimal places
    total_amount: itemAmount + serviceFeeAmount,
  };
}
