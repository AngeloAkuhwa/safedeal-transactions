/**
 * Shared pre-capture guard for the Paystack payment capture path.
 *
 * Both the client verify path (`verify-paystack-payment`) and the webhook
 * (`paystack-webhook`) must confirm that what Paystack actually charged
 * matches the immutable pricing snapshot locked at checkout BEFORE any
 * escrow money movement is booked.
 */

export interface PricingSnapshotLike {
  currency_code?: string | null;
  buyer_total_amount?: number | string | null;
}

export interface ChargeLike {
  amount?: number | string | null;
  currency?: string | null;
  reference?: string | null;
}

export type CaptureGuardResult =
  | { ok: true; expectedKobo: number; chargedKobo: number; currency: string }
  | {
      ok: false;
      error: "amount_mismatch";
      expectedKobo: number;
      chargedKobo: number;
      expectedCurrency: string;
      chargedCurrency: string;
      reason: "amount" | "currency";
    };

/**
 * Strict amount + currency check against a real pricing snapshot row.
 * Callers must only invoke this when a snapshot row exists.
 */
export function verifyChargeAgainstSnapshot(
  psData: ChargeLike,
  snapshot: PricingSnapshotLike,
): CaptureGuardResult {
  const expectedNaira = Number(snapshot.buyer_total_amount ?? NaN);
  const expectedKobo = Number.isFinite(expectedNaira) ? Math.round(expectedNaira * 100) : NaN;
  const chargedRaw = Number(psData.amount ?? NaN);
  const chargedKobo = Number.isFinite(chargedRaw) ? Math.round(chargedRaw) : NaN;

  const expectedCurrency = String(snapshot.currency_code || "NGN").toUpperCase();
  const chargedCurrency = String(psData.currency ?? "").toUpperCase();

  if (chargedCurrency !== expectedCurrency) {
    return {
      ok: false,
      error: "amount_mismatch",
      expectedKobo,
      chargedKobo,
      expectedCurrency,
      chargedCurrency,
      reason: "currency",
    };
  }

  if (!Number.isFinite(expectedKobo) || !Number.isFinite(chargedKobo) || expectedKobo !== chargedKobo) {
    return {
      ok: false,
      error: "amount_mismatch",
      expectedKobo,
      chargedKobo,
      expectedCurrency,
      chargedCurrency,
      reason: "amount",
    };
  }

  return { ok: true, expectedKobo, chargedKobo, currency: expectedCurrency };
}

/**
 * Reference binding: the Paystack reference that was actually verified is the
 * only source of truth for locating the payment row. A client-supplied
 * reference is advisory — if it points at a different payment, refuse.
 */
export function checkReferenceBinding(
  verifiedPaymentId: string | null | undefined,
  advisoryPaymentId: string | null | undefined,
): { ok: boolean; error?: "reference_mismatch" } {
  if (!advisoryPaymentId) return { ok: true };
  if (!verifiedPaymentId) return { ok: false, error: "reference_mismatch" };
  return advisoryPaymentId === verifiedPaymentId ? { ok: true } : { ok: false, error: "reference_mismatch" };
}
