/**
 * Canonical delivery-method vocabularies.
 *
 * There are two, and they are NOT interchangeable:
 *
 *  - `TRANSACTION_DELIVERY_METHODS`: the live `delivery_method_type` Postgres
 *    enum written to `transactions.delivery_method`. Exactly four members.
 *  - `PRODUCT_DELIVERY_METHODS`: the seller-chosen listing vocabulary stored
 *    as JSON in `products.delivery_method` (see `SellerProductCreate`), which
 *    the checkout edge functions map down onto the enum.
 *
 * Every branch keyed on a delivery method MUST use one of these lists (or,
 * better, the helpers below). Enforced by
 * `src/__tests__/delivery-methods.contract.test.ts`. Mirrored server-side by
 * `mapDeliveryMethod` in `supabase/functions/storefront-checkout` and
 * `supabase/functions/cart-checkout`.
 */

export const TRANSACTION_DELIVERY_METHODS = [
  "courier",
  "pickup",
  "meetup",
  "hand_delivery",
] as const;
export type TransactionDeliveryMethod = (typeof TRANSACTION_DELIVERY_METHODS)[number];

export const PRODUCT_DELIVERY_METHODS = [
  "pickup",
  "delivery",
  "courier_shipping",
  "digital",
  "hand_delivery",
  "meetup",
] as const;
export type ProductDeliveryMethod = (typeof PRODUCT_DELIVERY_METHODS)[number];

/** Listing vocabulary → enum. Must stay identical to the edge-function map. */
const PRODUCT_TO_TRANSACTION: Record<ProductDeliveryMethod, TransactionDeliveryMethod> = {
  pickup: "pickup",
  delivery: "courier",
  courier_shipping: "courier",
  digital: "hand_delivery",
  hand_delivery: "hand_delivery",
  meetup: "meetup",
};

export function isTransactionDeliveryMethod(m: unknown): m is TransactionDeliveryMethod {
  return typeof m === "string" && (TRANSACTION_DELIVERY_METHODS as readonly string[]).includes(m);
}

export function isProductDeliveryMethod(m: unknown): m is ProductDeliveryMethod {
  return typeof m === "string" && (PRODUCT_DELIVERY_METHODS as readonly string[]).includes(m);
}

/**
 * Resolve either vocabulary onto the enum. Returns `null` for unknown input —
 * callers must fail closed rather than guessing "courier".
 */
export function toTransactionDeliveryMethod(
  method: string | null | undefined,
): TransactionDeliveryMethod | null {
  if (isTransactionDeliveryMethod(method)) return method;
  if (isProductDeliveryMethod(method)) return PRODUCT_TO_TRANSACTION[method];
  return null;
}

/** A physical shipment is the only method that needs a delivery address. */
export function methodNeedsAddress(method: string | null | undefined): boolean {
  return toTransactionDeliveryMethod(method) === "courier";
}

/** In-person handoffs need a contact phone number instead. */
export function methodNeedsPhone(method: string | null | undefined): boolean {
  const resolved = toTransactionDeliveryMethod(method);
  return resolved === "pickup" || resolved === "meetup" || resolved === "hand_delivery";
}

/**
 * What the seller and buyer will actually coordinate over the phone, keyed on
 * the LISTING vocabulary: not the enum. `digital` collapses onto the
 * `hand_delivery` enum member, so keying this off the enum told buyers of a
 * digital product that the seller would coordinate "hand delivery".
 *
 * Returns `null` for anything unrecognised: callers must omit the sentence
 * rather than narrate a handoff shape they cannot name.
 */
const COORDINATION_NOUN: Record<ProductDeliveryMethod, string> = {
  pickup: "pickup",
  meetup: "the meetup",
  hand_delivery: "hand delivery",
  digital: "delivery of your digital item",
  delivery: "delivery",
  courier_shipping: "the shipment",
};

export function deliveryCoordinationNoun(method: string | null | undefined): string | null {
  if (isProductDeliveryMethod(method)) return COORDINATION_NOUN[method];
  if (isTransactionDeliveryMethod(method)) return COORDINATION_NOUN[method as ProductDeliveryMethod] ?? null;
  return null;
}
