/**
 * SafeDeal canonical financial model — the ONLY place money is computed.
 *
 * Rules:
 *  - All arithmetic happens in minor units (kobo) as integers. Never use
 *    floating point maths on naira values.
 *  - Every figure is derived from the persisted pricing snapshot plus the
 *    escrow ledger. Pricing formulas are never re-run at read time.
 *  - Page components and services render these fields; they never recompute.
 *
 * This module is intentionally dependency-free so it can be unit tested from
 * both Deno (edge functions) and Vitest (frontend test-suite).
 */

export type Minor = number; // integer minor units (kobo)

export function toMinor(value: number | string | null | undefined): Minor {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toMajor(minor: Minor): number {
  return Math.round(minor) / 100;
}

export const sumMinor = (...values: Minor[]): Minor =>
  values.reduce((a, b) => a + Math.round(b || 0), 0);

export interface PricingSnapshotRow {
  item_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  payment_processing_fee_amount?: number | string | null;
  seller_payout_amount?: number | string | null;
  buyer_total_amount?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  currency_code?: string | null;
}

export type LedgerEntryType =
  | "payment_credit"
  | "escrow_hold"
  | "freeze_hold"
  | "payout_debit"
  | "refund_debit"
  | "fee_record"
  | "adjustment"
  | "payout_awaiting_release"
  | "dispute_refund_reserved"
  | "dispute_release_approved_pending_admin_release"
  | "dispute_no_action";

/** Ledger entry types that represent real cash movement in/out of escrow. */
export const CASH_MOVEMENT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payment_credit",
  "escrow_hold",
  "payout_debit",
  "refund_debit",
  "adjustment",
]);

/** Entries that change the escrow balance (payment_credit is the buyer-side leg). */
const BALANCE_CREDITS: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "escrow_hold",
  "adjustment",
]);
const BALANCE_DEBITS: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payout_debit",
  "refund_debit",
]);

export interface LedgerRow {
  entry_type: LedgerEntryType | string;
  amount: number | string;
}

export interface PaymentRow { status: string; amount: number | string }
export interface PayoutRow {
  status: string;
  amount: number | string;
  completed_at?: string | null;
}
export interface RefundRow { status: string; refund_amount: number | string }

/** Canonical, display-ready financial figures for one transaction (naira). */
export interface CanonicalFinancials {
  currency: string;
  item_subtotal: number;
  buyer_protection_fee: number;
  processing_fee: number;
  discounts: number;
  taxes: number;
  total_buyer_charge: number;
  amount_captured: number;
  amount_in_escrow: number;
  refund_amount: number;
  seller_release_amount: number;
  platform_revenue: number;
  processing_cost: number;
  payout_amount: number;
  remaining_balance: number;
}

export interface BuildInput {
  pricing: PricingSnapshotRow | null | undefined;
  ledger: LedgerRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
  refunds: RefundRow[];
}

function ledgerSum(ledger: LedgerRow[], type: LedgerEntryType): Minor {
  let total = 0;
  for (const e of ledger) {
    if (e.entry_type === type) total += toMinor(e.amount);
  }
  return total;
}

/** Signed escrow balance from the ledger, in minor units. */
export function escrowBalanceMinor(ledger: LedgerRow[]): Minor {
  let total = 0;
  for (const e of ledger) {
    const t = e.entry_type as LedgerEntryType;
    if (BALANCE_CREDITS.has(t)) total += toMinor(e.amount);
    else if (BALANCE_DEBITS.has(t)) total -= toMinor(e.amount);
  }
  return total;
}

/**
 * Build the canonical financial view. Pricing supplies the agreed line items;
 * the ledger and operational rows supply what actually moved.
 */
export function buildCanonicalFinancials(input: BuildInput): CanonicalFinancials {
  const p = input.pricing ?? {};
  const item = toMinor(p.item_amount);
  const protectionFee = toMinor(p.platform_fee_amount);
  const processingFee = toMinor(p.payment_processing_fee_amount);
  const discounts = toMinor(p.discount_amount);
  const taxes = toMinor(p.tax_amount);

  const totalCharge = p.buyer_total_amount != null
    ? toMinor(p.buyer_total_amount)
    : item + protectionFee + processingFee + taxes - discounts;

  // Seller release amount comes from the snapshot only — never the buyer total.
  const sellerRelease = p.seller_payout_amount != null ? toMinor(p.seller_payout_amount) : item;

  const captured = input.payments
    .filter((r) => r.status === "succeeded")
    .reduce((acc, r) => acc + toMinor(r.amount), 0);

  const refunded = input.refunds
    .filter((r) => r.status === "completed")
    .reduce((acc, r) => acc + toMinor(r.refund_amount), 0);

  const paidOut = input.payouts
    .filter((r) => r.status === "completed")
    .reduce((acc, r) => acc + toMinor(r.amount), 0);

  const heldFromLedger = ledgerSum(input.ledger, "escrow_hold");
  const balance = escrowBalanceMinor(input.ledger);

  return {
    currency: p.currency_code ?? "NGN",
    item_subtotal: toMajor(item),
    buyer_protection_fee: toMajor(protectionFee),
    processing_fee: toMajor(processingFee),
    discounts: toMajor(discounts),
    taxes: toMajor(taxes),
    total_buyer_charge: toMajor(totalCharge),
    amount_captured: toMajor(captured),
    amount_in_escrow: toMajor(heldFromLedger),
    refund_amount: toMajor(refunded),
    seller_release_amount: toMajor(sellerRelease),
    platform_revenue: toMajor(protectionFee),
    processing_cost: toMajor(processingFee),
    payout_amount: toMajor(paidOut),
    remaining_balance: toMajor(Math.max(balance, 0)),
  };
}

/**
 * Guard used before any release or refund: the requested movement can never
 * exceed what escrow actually holds. Mirrors the database-level guard so the
 * UI can fail fast with a clear message.
 */
export function canDisburse(ledger: LedgerRow[], requestedMajor: number): boolean {
  const requested = toMinor(requestedMajor);
  return requested > 0 && requested <= escrowBalanceMinor(ledger);
}

/** A completed payout must carry a completion timestamp. */
export function payoutCompletionDisplay(row: PayoutRow): { value: string | null; needs_review: boolean } {
  if (row.status !== "completed") return { value: row.completed_at ?? null, needs_review: false };
  if (!row.completed_at) return { value: null, needs_review: true };
  return { value: row.completed_at, needs_review: false };
}