/**
 * Client-side pricing calculator mirroring the server-side logic
 * in supabase/functions/_shared/pricing.ts
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
    };
  }

  const paystackFee = computePaystackLocalFee(itemAmount);
  const tierRate = getSafeDealLocalTierRate(itemAmount);
  const targetServiceFee = Math.round(itemAmount * tierRate);
  const platformFee = Math.max(targetServiceFee - paystackFee, 0);
  const serviceFeeAmount = paystackFee + platformFee;
  const serviceFeeRate = serviceFeeAmount / itemAmount;

  return {
    currency_code: currencyCode,
    item_amount: itemAmount,
    paystack_fee_amount: paystackFee,
    platform_fee_amount: platformFee,
    service_fee_amount: serviceFeeAmount,
    service_fee_rate: Math.round(serviceFeeRate * 10000) / 10000,
    total_amount: itemAmount + serviceFeeAmount,
  };
}
