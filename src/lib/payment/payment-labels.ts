/**
 * Payment-flow label registry.
 *
 * Re-exports the project-wide status label maps from `@/lib/status-labels`
 * and adds the pricing-line label/helper copy that must appear identically
 * on every money-displaying screen.
 *
 * Forbidden labels (must NOT appear on user-facing surfaces): Delivery Fee,
 * Shipping Fee, Platform Processing Fee, Protection & Processing Fee, USD, $.
 */

export {
  resolveMoneyLabel,
  resolveTransactionLabel,
  resolveDisputeLabel,
  resolveEscrowStateLabel,
  resolvePayoutStatusLabel,
  resolveDisputeMoneyLabel,
  resolveDisputeOutcomeLabel,
  describeInternalReason,
  TONE_CLASSNAMES,
  type Audience,
  type Tone,
  type LabelEntry,
} from "@/lib/status-labels";

/* ---------- Pricing line labels (single source) ---------- */

export const PRICING_LINE_LABELS = {
  item_amount: "Item Total",
  safedeal_fee_amount: "SafeDeal Fee",
  payment_processing_fee_amount: "Payment Processing Fee",
  service_fee_amount: "Total Service Fee",
  total_amount: "Total Charged",
  seller_payout_amount: "Seller Payout",
} as const;

export type PricingLineKey = keyof typeof PRICING_LINE_LABELS;

export const PRICING_HELPER_COPY: Record<PricingLineKey, string | null> = {
  item_amount: null,
  safedeal_fee_amount:
    "SafeDeal Fee helps secure the transaction, support dispute review, and release funds only when the deal is completed safely.",
  payment_processing_fee_amount:
    "Payment Processing Fee covers the cost of processing your online payment. This fee is non-refundable once payment has been processed.",
  service_fee_amount:
    "SafeDeal keeps the total service fee capped at ₦2,500 for Nigeria MVP.",
  total_amount: null,
  seller_payout_amount:
    "You will receive this amount when the transaction is completed and funds are released.",
};

/** Display order for the buyer-facing pricing breakdown at checkout. */
export const BUYER_PRICING_ORDER: PricingLineKey[] = [
  "item_amount",
  "safedeal_fee_amount",
  "payment_processing_fee_amount",
  "service_fee_amount",
  "total_amount",
];

/** Display order for the seller-facing pricing surface. */
export const SELLER_PRICING_ORDER: PricingLineKey[] = [
  "item_amount",
  "seller_payout_amount",
];

export const FORBIDDEN_PRICING_LABELS = [
  "Delivery Fee",
  "Shipping Fee",
  "Platform Processing Fee",
  "Protection & Processing Fee",
  "USD",
] as const;