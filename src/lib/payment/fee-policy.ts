/**
 * SINGLE SOURCE OF TRUTH for the buyer-facing fee name and refund policy copy.
 *
 * Every screen that names the SafeDeal fee or states the refund policy MUST
 * import from here. Do not re-word these strings inline. The review page, the
 * payment page, the checkout pages and the legal refund policy must always
 * agree.
 */

import { PRICING_LINE_LABELS } from "./payment-labels";

/**
 * The one and only buyer-facing name for the aggregate SafeDeal fee.
 * Bound to the canonical pricing-line label so the itemised breakdown and the
 * single-line fee on other screens can never drift apart.
 */
export const FEE_NAME = PRICING_LINE_LABELS.service_fee_amount;

/** One-line description of what the fee buys. */
export const FEE_COVERS = "Covers escrow, buyer protection and dispute resolution";

/**
 * The one and only refund sentence. Internally consistent with FEE_NAME being
 * non-refundable: the item price is refundable, the fee is not.
 */
export const REFUND_SENTENCE =
  `If a deal is refunded, the item price is returned in full. The ${FEE_NAME} is not refunded once payment has been processed.`;

/** Compact variant for tight bullet lists. Same meaning as REFUND_SENTENCE. */
export const REFUND_BULLET =
  `Item price refunded in full if the item doesn't match: ${FEE_NAME} excluded`;

/** Short inline caption used directly under the fee line. */
export const FEE_CAPTION = `Not refunded once payment is processed · ${FEE_COVERS}`;