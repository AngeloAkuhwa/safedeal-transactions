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

  const expectedCurrency = String(snapshot.currency_code ?? "").trim().toUpperCase();
  const chargedCurrency = String(psData.currency ?? "").toUpperCase();

  if (!expectedCurrency || chargedCurrency !== expectedCurrency) {
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
 * reference is advisory: if it points at a different payment, refuse.
 */
export function checkReferenceBinding(
  verifiedPaymentId: string | null | undefined,
  advisoryPaymentId: string | null | undefined,
): { ok: boolean; error?: "reference_mismatch" } {
  if (!advisoryPaymentId) return { ok: true };
  if (!verifiedPaymentId) return { ok: false, error: "reference_mismatch" };
  return advisoryPaymentId === verifiedPaymentId ? { ok: true } : { ok: false, error: "reference_mismatch" };
}

export interface InitiationChargeInput {
  snapshot?: PricingSnapshotLike | null;
  /** Live recomputation, used only when no snapshot row exists. */
  computed: { currency_code: string; total_amount: number };
}

export interface InitiationCharge {
  currency_code: string;
  total_amount: number;
  amount_kobo: number;
  source: "snapshot" | "computed";
}

/**
 * What we charge at initiation must equal the locked agreement the buyer saw.
 * The `transaction_pricing` snapshot wins; live recomputation is a fallback
 * only for transactions that genuinely have no snapshot row.
 */
export function resolveInitiationCharge(input: InitiationChargeInput): InitiationCharge {
  const snapTotal = Number(input.snapshot?.buyer_total_amount ?? NaN);
  if (input.snapshot && Number.isFinite(snapTotal) && snapTotal > 0) {
    const snapshotCurrency = String(input.snapshot.currency_code ?? "").trim().toUpperCase();
    if (!snapshotCurrency) throw new Error("missing_snapshot_currency");
    return {
      currency_code: snapshotCurrency,
      total_amount: snapTotal,
      amount_kobo: Math.round(snapTotal * 100),
      source: "snapshot",
    };
  }
  const computedCurrency = String(input.computed.currency_code ?? "").trim().toUpperCase();
  if (!computedCurrency) throw new Error("missing_computed_currency");
  return {
    currency_code: computedCurrency,
    total_amount: input.computed.total_amount,
    amount_kobo: Math.round(input.computed.total_amount * 100),
    source: "computed",
  };
}
