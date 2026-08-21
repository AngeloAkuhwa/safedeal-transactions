/**
 * Phase 5: canonical money copy for edge-function notifications and
 * (eventually) transactional emails.
 *
 * Server-side mirror of `src/lib/payment/payment-labels.ts` so backend output
 * matches the in-app `<PricingBreakdown>` and `<SellerPayoutLine>` UI line
 * for line. Do NOT introduce ad-hoc labels in edge functions. Import from
 * here instead.
 */

import { formatMoney as fmtMoney, formatMoneyCsv } from "./format.ts";

export type PricingLineKey =
  | "item_amount"
  | "safedeal_fee_amount"
  | "payment_processing_fee_amount"
  | "service_fee_amount"
  | "total_amount"
  | "seller_payout_amount";

export const PRICING_LINE_LABELS: Record<PricingLineKey, string> = {
  item_amount: "Item Total",
  safedeal_fee_amount: "SafeDeal Fee",
  payment_processing_fee_amount: "Payment Processing Fee",
  service_fee_amount: "Total Service Fee",
  total_amount: "Total Charged",
  seller_payout_amount: "Seller Payout",
};

export function resolveMoneyLabel(key: PricingLineKey): string {
  return PRICING_LINE_LABELS[key];
}

/** Re-export so notifications use one helper. NEVER call `toLocaleString()`
 *  on raw amounts in notification copy. Always go through `formatMoney`. */
export function formatMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  return fmtMoney(amount, currency);
}

/** UI-aligned "missing money" fallback. */
export function formatMoneyOrDash(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount)) || !currency) {
    return "—";
  }
  return fmtMoney(amount, currency);
}

export { formatMoneyCsv };

/**
 * Raw `transaction_pricing` row shape we expect to read. Every field is
 * optional + nullable so legacy/locked snapshots still deserialize cleanly.
 */
export interface PricingRow {
  item_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  /** @deprecated Legacy column. Prefer `payment_processing_fee_amount`. */
  processing_fee_amount?: number | string | null;
  payment_processing_fee_amount?: number | string | null;
  service_fee_amount?: number | string | null;
  buyer_total_amount?: number | string | null;
  /** @deprecated Legacy column. Prefer `seller_payout_amount`. */
  seller_net_amount?: number | string | null;
  seller_payout_amount?: number | string | null;
  currency_code?: string | null;
  is_total_service_fee_capped?: boolean | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface PricingLine {
  key: PricingLineKey;
  label: string;
  amount: number | null;
  formatted: string;
}

export interface BuyerReceipt {
  currency: string;
  lines: PricingLine[];
  total: PricingLine;
  is_total_service_fee_capped: boolean;
  capped_footnote: string | null;
}

/**
 * Build the canonical 5-line buyer receipt block from a raw
 * `transaction_pricing` row. Mirrors `viewFromRow()` in the service layer.
 */
export function buildBuyerReceiptLines(row: PricingRow | null | undefined): BuyerReceipt {
  const currency = (row?.currency_code || "NGN").toUpperCase();
  const item = num(row?.item_amount);
  const safedeal = num(row?.platform_fee_amount) ?? 0;
  const processing =
    num(row?.payment_processing_fee_amount) ?? num(row?.processing_fee_amount) ?? 0;
  const service = num(row?.service_fee_amount) ?? safedeal + processing;
  const total = num(row?.buyer_total_amount) ?? (item != null ? item + service : null);
  const capped = Boolean(row?.is_total_service_fee_capped);

  const makeLine = (key: PricingLineKey, amount: number | null): PricingLine => ({
    key,
    label: PRICING_LINE_LABELS[key],
    amount,
    formatted: formatMoneyOrDash(amount, currency),
  });

  return {
    currency,
    lines: [
      makeLine("item_amount", item),
      makeLine("safedeal_fee_amount", safedeal),
      makeLine("payment_processing_fee_amount", processing),
      makeLine("service_fee_amount", service),
    ],
    total: makeLine("total_amount", total),
    is_total_service_fee_capped: capped,
    capped_footnote: capped
      ? "Total Service Fee is capped at \u20A62,500 by SafeDeal."
      : null,
  };
}

/** Single "Seller Payout" line. Mirrors `<SellerPayoutLine>`. */
export function buildSellerPayoutLines(
  row: PricingRow | null | undefined,
): PricingLine {
  const currency = (row?.currency_code || "NGN").toUpperCase();
  const amount = num(row?.seller_payout_amount) ?? num(row?.seller_net_amount);
  return {
    key: "seller_payout_amount",
    label: PRICING_LINE_LABELS.seller_payout_amount,
    amount,
    formatted: formatMoneyOrDash(amount, currency),
  };
}