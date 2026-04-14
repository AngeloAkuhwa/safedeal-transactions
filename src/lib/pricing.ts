/**
 * Client-side pricing calculator mirroring the server-side logic
 * in supabase/functions/_shared/pricing.ts
 */

const MIN_PLATFORM_FEE = 250;
const MAX_TOTAL_FEE = 2500;

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

function computePaystackLocalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.015;
  const flatFee = itemAmount < 2500 ? 0 : 100;
  const rawFee = percentageFee + flatFee;
  return Math.min(Math.round(rawFee), 2000);
}

function getSafeDealLocalTierRate(itemAmount: number): number {
  if (itemAmount <= 100_000) return 0.039;
  if (itemAmount <= 500_000) return 0.035;
  if (itemAmount <= 2_000_000) return 0.029;
  return 0.025;
}

export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN"
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
      is_floored: false,
      is_capped: false,
      non_refundable: true,
    };
  }

  const paystackFee = computePaystackLocalFee(itemAmount);
  const tierRate = getSafeDealLocalTierRate(itemAmount);

  // Platform fee = max(₦250, tierRate × item - paystackFee)
  const rawPlatformFee = Math.max(MIN_PLATFORM_FEE, Math.round(itemAmount * tierRate) - paystackFee);

  // Total service fee = min(₦2,500, paystackFee + platformFee)
  const rawServiceFee = paystackFee + rawPlatformFee;
  const serviceFeeAmount = Math.min(rawServiceFee, MAX_TOTAL_FEE);

  // Recalculate platform fee after cap
  const platformFee = Math.max(serviceFeeAmount - paystackFee, 0);

  const is_floored = rawPlatformFee === MIN_PLATFORM_FEE;
  const is_capped = rawServiceFee > MAX_TOTAL_FEE;

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
