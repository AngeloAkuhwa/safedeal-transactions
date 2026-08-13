// Shared guard rules for advancing a transaction to delivered_awaiting_verification.
// Used by both the rider OTP fallback path and the authenticated buyer path.

/** Money must actually be held in escrow before delivery can start the release clock. */
export const REQUIRED_MONEY_STATUS = "funds_held_in_escrow";

/** Statuses where delivery confirmation is a no-op (already delivered / terminal). */
export const DELIVERY_DONE_STATUSES = [
  "delivered_awaiting_verification",
  "completed",
  "disputed",
  "resolved",
  "refunded",
] as const;

/** Statuses from which a delivery confirmation may advance the transaction. */
export const DELIVERY_CONFIRMABLE_STATUSES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
] as const;

export interface DeliveryGuardInput {
  status: string;
  money_status?: string | null;
}

export interface DeliveryGuardFailure {
  error: string;
  message: string;
  http: number;
}

export function isDeliveryAlreadyDone(status: string): boolean {
  return (DELIVERY_DONE_STATUSES as readonly string[]).includes(status);
}

/**
 * Returns null when the transaction may be advanced, otherwise a failure.
 * Callers must handle the already-done case (idempotency) before calling this.
 */
export function evaluateDeliveryConfirmGuard(tx: DeliveryGuardInput): DeliveryGuardFailure | null {
  if (tx.money_status !== REQUIRED_MONEY_STATUS) {
    return {
      error: "funds_not_held",
      message:
        "Delivery cannot be confirmed: the buyer's funds are not currently held in escrow for this transaction.",
      http: 409,
    };
  }
  if (!(DELIVERY_CONFIRMABLE_STATUSES as readonly string[]).includes(tx.status)) {
    return {
      error: "invalid_status",
      message: `Delivery cannot be confirmed from status "${tx.status}".`,
      http: 409,
    };
  }
  return null;
}
