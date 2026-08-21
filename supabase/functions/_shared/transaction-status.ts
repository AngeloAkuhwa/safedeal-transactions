/**
 * Canonical `transaction_status` enum members (public.transaction_status).
 * Keep in sync with the database enum. Tests assert the two match.
 */
export const TRANSACTION_STATUSES = [
  "draft",
  "awaiting_buyer",
  "awaiting_payment",
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "completed",
  "disputed",
  "cancelled",
  "timed_out",
  "resolved",
  "refunded",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export function isTransactionStatus(value: string): value is TransactionStatus {
  return (TRANSACTION_STATUSES as readonly string[]).includes(value);
}

/** Buyer dashboard metric groupings, expressed only in real enum members. */
export const BUYER_AWAITING_DELIVERY_STATUSES: TransactionStatus[] = [
  "seller_preparing_delivery",
  "seller_dispatched",
];

export const BUYER_AWAITING_VERIFICATION_STATUSES: TransactionStatus[] = [
  "delivered_awaiting_verification",
];
