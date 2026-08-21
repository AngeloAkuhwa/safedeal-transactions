/**
 * SafeDeal canonical financial model. The ONLY place money is computed.
 *
 * Checkpoint 1 (zero-runtime): this module is intentionally imported by no
 * runtime code yet. Consumers are migrated in Checkpoint 3.
 *
 * Rules:
 *  - All arithmetic happens in validated integer minor units (kobo). Never use
 *    floating point maths on naira values.
 *  - Postgres `numeric` values arrive as strings and are converted by ONE exact
 *    decimal parser. Rounding is applied once, at ingestion.
 *  - Invalid money FAILS CLOSED: it raises/collects an InvariantError, marks the
 *    transaction `requires_review` and blocks every mutation. Nothing is
 *    clamped to zero.
 *  - Every figure is derived from the persisted pricing snapshot plus the
 *    escrow ledger. Pricing formulas are never re-run at read time.
 *
 * Dependency-free so it can be unit tested from both Deno and Vitest.
 */

export type Minor = number; // integer minor units (kobo)

/** Magnitude ceiling: 1e13 kobo = 100 billion naira. */
export const MAX_MINOR = 1_000_000_000_000_0;

export const MINOR_PRECISION = 2;

export interface InvariantIssue {
  code: string;
  field: string;
  raw: unknown;
  transactionId?: string | null;
  message: string;
}

export class InvariantError extends Error {
  readonly issues: InvariantIssue[];
  constructor(issues: InvariantIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
    this.name = "InvariantError";
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ *
 * 4.0. Exact decimal ingestion
 * ------------------------------------------------------------------ */

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export interface ParseOptions {
  field: string;
  transactionId?: string | null;
  /** allow negative results (signed fields such as adjustments) */
  signed?: boolean;
}

export interface ParseResult {
  ok: boolean;
  value: Minor;
  issue?: InvariantIssue;
}

function issue(
  code: string,
  opts: ParseOptions,
  raw: unknown,
  message: string,
): InvariantIssue {
  return { code, field: opts.field, raw, transactionId: opts.transactionId ?? null, message };
}

/**
 * Convert a Postgres numeric string (or number) to integer minor units,
 * textually: no float multiplication. Rounding (half-up, away from zero) is
 * applied exactly once here, and only when the source carries more fractional
 * digits than the currency precision.
 */
export function parseMinor(
  raw: number | string | null | undefined,
  opts: ParseOptions,
): ParseResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, value: 0, issue: issue("missing_value", opts, raw, "value is missing") };
  }
  let text: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { ok: false, value: 0, issue: issue("not_finite", opts, raw, "value is not finite") };
    }
    text = raw.toFixed(MINOR_PRECISION + 4);
  } else {
    text = raw.trim();
  }

  const m = DECIMAL_RE.exec(text);
  if (!m) {
    return { ok: false, value: 0, issue: issue("unparseable", opts, raw, "value is not a decimal number") };
  }
  const [, sign, intPart, fracPartRaw = ""] = m;
  const negative = sign === "-";

  const keep = fracPartRaw.slice(0, MINOR_PRECISION).padEnd(MINOR_PRECISION, "0");
  const rest = fracPartRaw.slice(MINOR_PRECISION);

  let digits = `${intPart}${keep}`.replace(/^0+(?=\d)/, "");
  let value = Number(digits);
  if (!Number.isFinite(value)) {
    return { ok: false, value: 0, issue: issue("overflow", opts, raw, "value exceeds numeric range") };
  }
  // round half-up on the discarded remainder, once
  if (rest.length > 0 && /[1-9]/.test(rest)) {
    if (Number(rest[0]) >= 5) value += 1;
  }
  if (negative) value = -value;

  if (!Number.isSafeInteger(value)) {
    return { ok: false, value: 0, issue: issue("unsafe_integer", opts, raw, "value is not a safe integer in minor units") };
  }
  if (Math.abs(value) > MAX_MINOR) {
    return { ok: false, value: 0, issue: issue("overflow", opts, raw, "value exceeds the documented magnitude ceiling") };
  }
  if (value < 0 && !opts.signed) {
    return { ok: false, value: 0, issue: issue("negative_not_allowed", opts, raw, "value must not be negative") };
  }
  return { ok: true, value };
}

/** Strict variant: throws instead of returning an issue. */
export function parseMinorOrThrow(raw: number | string | null | undefined, opts: ParseOptions): Minor {
  const r = parseMinor(raw, opts);
  if (!r.ok) throw new InvariantError([r.issue!]);
  return r.value;
}

export function toMajor(minor: Minor): number {
  return Math.round(minor) / 100;
}

export const sumMinor = (...values: Minor[]): Minor =>
  values.reduce((a, b) => a + Math.round(b || 0), 0);

/**
 * @deprecated legacy float helper retained only for pre-Checkpoint-3 callers.
 * Use `parseMinor`. Does not validate and must never be used for mutations.
 */
export function toMinor(value: number | string | null | undefined): Minor {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ *
 * 4.1. Verified vocabulary (live enums)
 * ------------------------------------------------------------------ */

export type PaymentStatus = "pending" | "authorized" | "succeeded" | "failed" | "refunded";
export type PayoutStatus =
  | "awaiting_release" | "pending" | "processing" | "completed"
  | "failed" | "cancelled" | "blocked" | "reversed";
export type RefundStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

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

/** Statuses counted as authorised money (superset of captured). */
export const AUTHORISED_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
  "authorized",
  "succeeded",
]);
export const CAPTURED_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
  "succeeded",
]);

/** Ledger entry types that represent real cash movement in/out of escrow. */
export const CASH_MOVEMENT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payment_credit",
  "escrow_hold",
  "payout_debit",
  "refund_debit",
  "adjustment",
]);

/**
 * Every entry type that changes or reserves financial value. Used by the
 * Checkpoint 2C idempotency trigger (which tests entry_type directly, never
 * the generated is_cash_movement column).
 */
export const VALUE_AFFECTING_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payment_credit",
  "escrow_hold",
  "payout_debit",
  "refund_debit",
  "adjustment",
  "freeze_hold",
  "payout_awaiting_release",
  "dispute_refund_reserved",
  "dispute_release_approved_pending_admin_release",
]);

/** Terms of `escrow_available_balance` (the authoritative DB routine). */
const BALANCE_CREDITS: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "escrow_hold",
  "adjustment",
]);
const BALANCE_DEBITS: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payout_debit",
  "refund_debit",
]);

/** Approved-but-unexecuted release intent markers. */
const PENDING_RELEASE_LEDGER_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  "payout_awaiting_release",
  "dispute_release_approved_pending_admin_release",
]);

/* ------------------------------------------------------------------ *
 * Row shapes
 * ------------------------------------------------------------------ */

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

export interface LedgerRow {
  entry_type: LedgerEntryType | string;
  amount: number | string;
  currency_code?: string | null;
  reference_id?: string | null;
  idempotency_key?: string | null;
}

export interface PaymentRow { status: PaymentStatus | string; amount: number | string }
export interface PayoutRow {
  status: PayoutStatus | string;
  amount: number | string;
  completed_at?: string | null;
  released_at?: string | null;
  provider_completed_at?: string | null;
}
export interface RefundRow { status: RefundStatus | string; refund_amount: number | string }

export type ReconciliationStatus =
  | "reconciled" | "pending_settlement" | "mismatch" | "requires_review";

export type FinancialExecutionStatus =
  | "not_funded" | "held" | "frozen" | "pending_release" | "pending_payout"
  | "released" | "refunded" | "partially_refunded" | "failed_settlement";

/** Canonical, display-ready financial figures for one transaction (minor units). */
export interface CanonicalFinancials {
  currency: string;
  item_subtotal: Minor;
  buyer_protection_fee: Minor;
  processing_fee: Minor;
  discounts: Minor;
  taxes: Minor;
  total_buyer_charge: Minor;
  amount_authorised: Minor;
  amount_captured: Minor;
  fees_retained: Minor;
  amount_in_escrow: Minor;
  available_escrow: Minor;
  remaining_balance: Minor;
  frozen_amount: Minor;
  refund_amount: Minor;
  /** null when the authoritative snapshot value is missing. Mutations blocked. */
  seller_release_amount: Minor | null;
  /** NON-AUTHORITATIVE display estimate. Never used by release/refund logic. */
  seller_release_amount_display_estimate: Minor | null;
  payout_amount: Minor;
  pending_release_amount: Minor;
  pending_payout_amount: Minor;
  failed_settlement_amount: Minor;
  committed_amount: Minor;
  platform_revenue: Minor;
  processing_cost: Minor;
  disbursable: Minor;
  reconciliation_status: ReconciliationStatus;
  financial_execution_status: FinancialExecutionStatus;
  invariants: InvariantIssue[];
  /** true when any invariant failed: every mutation path must refuse. */
  mutations_blocked: boolean;
}

export interface BuildInput {
  transactionId?: string | null;
  pricing: PricingSnapshotRow | null | undefined;
  ledger: LedgerRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
  refunds: RefundRow[];
  /** money_status from the transaction row, used only for status precedence. */
  moneyStatus?: string | null;
}

/* ------------------------------------------------------------------ *
 * 4.2. Conservation identities
 * ------------------------------------------------------------------ */

/**
 * Signed escrow balance, mirroring `escrow_available_balance`:
 *   escrow_hold + adjustment − payout_debit − refund_debit
 * `freeze_hold`, `fee_record`, `payment_credit` and the dispute intent markers
 * are deliberately NOT balance terms.
 */
export function escrowBalanceMinor(ledger: LedgerRow[], issues: InvariantIssue[] = []): Minor {
  let total = 0;
  for (const e of ledger) {
    const t = e.entry_type as LedgerEntryType;
    if (!BALANCE_CREDITS.has(t) && !BALANCE_DEBITS.has(t)) continue;
    const r = parseMinor(e.amount, {
      field: `ledger.${t}.amount`,
      signed: t === "adjustment",
    });
    if (!r.ok) { issues.push(r.issue!); continue; }
    if (BALANCE_CREDITS.has(t)) total += r.value;
    else total -= r.value;
  }
  return total;
}

/** (A) amount_captured = Σ escrow_hold + Σ fee_record */
export function checkCaptureIdentity(f: {
  amount_captured: Minor; amount_in_escrow: Minor; fees_retained: Minor;
}): boolean {
  return f.amount_captured === f.amount_in_escrow + f.fees_retained;
}

/** (B) Σ escrow_hold + Σ adjustment = Σ payout_debit + Σ refund_debit + available_escrow */
export function checkEscrowMovementIdentity(ledger: LedgerRow[]): boolean {
  const s = (t: LedgerEntryType, signed = false) => ledgerSum(ledger, t, signed);
  return s("escrow_hold") + s("adjustment", true)
    === s("payout_debit") + s("refund_debit") + escrowBalanceMinor(ledger);
}

function ledgerSum(
  ledger: LedgerRow[],
  type: LedgerEntryType,
  signed = false,
  issues: InvariantIssue[] = [],
): Minor {
  let total = 0;
  for (const e of ledger) {
    if (e.entry_type !== type) continue;
    const r = parseMinor(e.amount, { field: `ledger.${type}.amount`, signed });
    if (!r.ok) { issues.push(r.issue!); continue; }
    total += r.value;
  }
  return total;
}

function sumRows<T>(
  rows: T[],
  pick: (r: T) => number | string,
  keep: (r: T) => boolean,
  field: string,
  issues: InvariantIssue[],
  transactionId?: string | null,
): Minor {
  let total = 0;
  for (const r of rows) {
    if (!keep(r)) continue;
    const p = parseMinor(pick(r), { field, transactionId });
    if (!p.ok) { issues.push(p.issue!); continue; }
    total += p.value;
  }
  return total;
}

/* ------------------------------------------------------------------ *
 * Canonical builder
 * ------------------------------------------------------------------ */

export function buildCanonicalFinancials(input: BuildInput): CanonicalFinancials {
  const txId = input.transactionId ?? null;
  const issues: InvariantIssue[] = [];
  const p = input.pricing ?? {};

  const required = (raw: unknown, field: string): Minor => {
    const r = parseMinor(raw as never, { field, transactionId: txId });
    if (!r.ok) { issues.push(r.issue!); return 0; }
    return r.value;
  };
  /** Optional, business-safe fallback of 0 when absent (documented). */
  const optionalZero = (raw: unknown, field: string): Minor => {
    if (raw === null || raw === undefined || raw === "") return 0;
    const r = parseMinor(raw as never, { field, transactionId: txId });
    if (!r.ok) { issues.push(r.issue!); return 0; }
    return r.value;
  };

  const currency = p.currency_code ?? "NGN";
  const ledgerCurrencies = new Set(
    input.ledger.map((l) => l.currency_code).filter((c): c is string => !!c),
  );
  for (const c of ledgerCurrencies) {
    if (c !== currency) {
      issues.push({
        code: "currency_mismatch", field: "ledger.currency_code", raw: c,
        transactionId: txId, message: `ledger currency ${c} does not match ${currency}`,
      });
    }
  }

  const item_subtotal = required(p.item_amount, "pricing.item_amount");
  const buyer_protection_fee = optionalZero(p.platform_fee_amount, "pricing.platform_fee_amount");
  const processing_fee = optionalZero(p.payment_processing_fee_amount, "pricing.payment_processing_fee_amount");
  const discounts = optionalZero(p.discount_amount, "pricing.discount_amount");
  const taxes = optionalZero(p.tax_amount, "pricing.tax_amount");

  const derivedTotal = item_subtotal + buyer_protection_fee + processing_fee + taxes - discounts;
  let total_buyer_charge = derivedTotal;
  if (p.buyer_total_amount !== null && p.buyer_total_amount !== undefined && p.buyer_total_amount !== "") {
    const snap = required(p.buyer_total_amount, "pricing.buyer_total_amount");
    total_buyer_charge = snap;
    if (snap !== derivedTotal) {
      issues.push({
        code: "total_parts_mismatch", field: "pricing.buyer_total_amount", raw: p.buyer_total_amount,
        transactionId: txId,
        message: `snapshot total ${snap} != sum of parts ${derivedTotal}`,
      });
    }
  }

  // Seller release amount: authoritative snapshot only, NO item_amount fallback.
  let seller_release_amount: Minor | null = null;
  if (p.seller_payout_amount !== null && p.seller_payout_amount !== undefined && p.seller_payout_amount !== "") {
    const r = parseMinor(p.seller_payout_amount, { field: "pricing.seller_payout_amount", transactionId: txId });
    if (r.ok) seller_release_amount = r.value;
    else issues.push(r.issue!);
  } else {
    issues.push({
      code: "missing_seller_payout_snapshot", field: "pricing.seller_payout_amount",
      raw: p.seller_payout_amount, transactionId: txId,
      message: "authoritative seller payout snapshot is missing; mutations blocked",
    });
  }
  const seller_release_amount_display_estimate =
    seller_release_amount === null ? item_subtotal : null;

  const amount_authorised = sumRows(
    input.payments, (r) => r.amount,
    (r) => AUTHORISED_PAYMENT_STATUSES.has(r.status as PaymentStatus),
    "payments.amount", issues, txId,
  );
  const amount_captured = sumRows(
    input.payments, (r) => r.amount,
    (r) => CAPTURED_PAYMENT_STATUSES.has(r.status as PaymentStatus),
    "payments.amount", issues, txId,
  );

  const amount_in_escrow = ledgerSum(input.ledger, "escrow_hold", false, issues);
  const fees_retained = ledgerSum(input.ledger, "fee_record", false, issues);
  const available_escrow = escrowBalanceMinor(input.ledger, issues);
  const payout_debits = ledgerSum(input.ledger, "payout_debit", false, issues);
  const refund_debits = ledgerSum(input.ledger, "refund_debit", false, issues);
  const adjustments = ledgerSum(input.ledger, "adjustment", true, issues);

  const freeze = ledgerSum(input.ledger, "freeze_hold", false, issues);
  const unfreeze = input.ledger
    .filter((l) => l.entry_type === "adjustment" && (l as { reference_type?: string }).reference_type === "admin_unfreeze")
    .reduce((acc, l) => {
      const r = parseMinor(l.amount, { field: "ledger.adjustment.amount", signed: true });
      if (!r.ok) { issues.push(r.issue!); return acc; }
      return acc + r.value;
    }, 0);
  const frozen_amount = freeze - unfreeze;
  if (frozen_amount < 0) {
    issues.push({
      code: "negative_frozen", field: "frozen_amount", raw: frozen_amount, transactionId: txId,
      message: "unfreeze adjustments exceed freeze holds",
    });
  }

  const refund_amount = sumRows(
    input.refunds, (r) => r.refund_amount, (r) => r.status === "completed",
    "refunds.refund_amount", issues, txId,
  );
  const payout_amount = sumRows(
    input.payouts, (r) => r.amount, (r) => r.status === "completed",
    "payouts.amount", issues, txId,
  );
  const pending_payout_amount = sumRows(
    input.payouts, (r) => r.amount, (r) => r.status === "pending" || r.status === "processing",
    "payouts.amount", issues, txId,
  );
  const failed_settlement_amount = sumRows(
    input.payouts, (r) => r.amount, (r) => r.status === "failed",
    "payouts.amount", issues, txId,
  );
  const awaitingReleasePayouts = sumRows(
    input.payouts, (r) => r.amount, (r) => r.status === "awaiting_release",
    "payouts.amount", issues, txId,
  );
  let pendingReleaseLedger = 0;
  for (const t of PENDING_RELEASE_LEDGER_TYPES) {
    pendingReleaseLedger += ledgerSum(input.ledger, t, false, issues);
  }
  const pending_release_amount = pendingReleaseLedger + awaitingReleasePayouts;

  const committed_amount =
    pending_release_amount + pending_payout_amount + failed_settlement_amount;

  const disbursable = available_escrow - frozen_amount - pending_payout_amount
    - failed_settlement_amount - pending_release_amount;

  // ---- identities -------------------------------------------------
  if (amount_captured !== amount_in_escrow + fees_retained) {
    issues.push({
      code: "capture_identity_violation", field: "amount_captured", raw: amount_captured,
      transactionId: txId,
      message: `captured ${amount_captured} != escrow_hold ${amount_in_escrow} + fee_record ${fees_retained}`,
    });
  }
  if (amount_in_escrow + adjustments !== payout_debits + refund_debits + available_escrow) {
    issues.push({
      code: "escrow_movement_identity_violation", field: "available_escrow",
      raw: available_escrow, transactionId: txId,
      message: "escrow_hold + adjustment != payout_debit + refund_debit + available_escrow",
    });
  }
  if (available_escrow < 0) {
    issues.push({
      code: "negative_available_escrow", field: "available_escrow", raw: available_escrow,
      transactionId: txId, message: "available escrow is negative",
    });
  }
  if (amount_authorised < amount_captured) {
    issues.push({
      code: "captured_exceeds_authorised", field: "amount_captured", raw: amount_captured,
      transactionId: txId, message: "captured exceeds authorised",
    });
  }
  if (refund_amount > amount_captured) {
    issues.push({
      code: "refund_exceeds_capture", field: "refund_amount", raw: refund_amount,
      transactionId: txId, message: "completed refunds exceed captured amount",
    });
  }
  if (payout_amount !== payout_debits) {
    issues.push({
      code: "payout_ledger_mismatch", field: "payout_amount", raw: payout_amount,
      transactionId: txId, message: "completed payouts do not match payout_debit entries",
    });
  }
  if (frozen_amount > available_escrow) {
    issues.push({
      code: "frozen_exceeds_available", field: "frozen_amount", raw: frozen_amount,
      transactionId: txId, message: "frozen amount exceeds available escrow",
    });
  }

  const hardMismatch = issues.some((i) =>
    i.code === "capture_identity_violation" ||
    i.code === "escrow_movement_identity_violation" ||
    i.code === "payout_ledger_mismatch"
  );
  const reconciliation_status: ReconciliationStatus = issues.length === 0
    ? (committed_amount > 0 ? "pending_settlement" : "reconciled")
    : hardMismatch && issues.every((i) =>
        ["capture_identity_violation", "escrow_movement_identity_violation", "payout_ledger_mismatch"].includes(i.code))
      ? "mismatch"
      : "requires_review";

  const financial_execution_status = deriveExecutionStatus({
    failed_settlement_amount, frozen_amount, refund_amount, amount_captured,
    payout_amount, pending_payout_amount, pending_release_amount, available_escrow,
  });

  return {
    currency,
    item_subtotal,
    buyer_protection_fee,
    processing_fee,
    discounts,
    taxes,
    total_buyer_charge,
    amount_authorised,
    amount_captured,
    fees_retained,
    amount_in_escrow,
    available_escrow,
    remaining_balance: available_escrow,
    frozen_amount,
    refund_amount,
    seller_release_amount,
    seller_release_amount_display_estimate,
    payout_amount,
    pending_release_amount,
    pending_payout_amount,
    failed_settlement_amount,
    committed_amount,
    platform_revenue: buyer_protection_fee,
    processing_cost: processing_fee,
    disbursable,
    reconciliation_status,
    financial_execution_status,
    invariants: issues,
    mutations_blocked: issues.length > 0,
  };
}

export function deriveExecutionStatus(f: {
  failed_settlement_amount: Minor; frozen_amount: Minor; refund_amount: Minor;
  amount_captured: Minor; payout_amount: Minor; pending_payout_amount: Minor;
  pending_release_amount: Minor; available_escrow: Minor;
}): FinancialExecutionStatus {
  if (f.failed_settlement_amount > 0) return "failed_settlement";
  if (f.frozen_amount > 0) return "frozen";
  if (f.refund_amount > 0 && f.refund_amount >= f.amount_captured) return "refunded";
  if (f.refund_amount > 0) return "partially_refunded";
  if (f.payout_amount > 0) return "released";
  if (f.pending_payout_amount > 0) return "pending_payout";
  if (f.pending_release_amount > 0) return "pending_release";
  if (f.available_escrow > 0) return "held";
  return "not_funded";
}

/* ------------------------------------------------------------------ *
 * Mutation guards
 * ------------------------------------------------------------------ */

export interface DisburseCheck { allowed: boolean; reason?: string }

/**
 * Guard used before any release or refund. Fails closed on invariant errors and
 * on a missing authoritative seller payout snapshot.
 */
export function canDisburse(f: CanonicalFinancials, requestedMinor: Minor): DisburseCheck {
  if (f.mutations_blocked) return { allowed: false, reason: "invariant_failure" };
  if (!Number.isSafeInteger(requestedMinor)) return { allowed: false, reason: "invalid_amount" };
  if (requestedMinor <= 0) return { allowed: false, reason: "non_positive_amount" };
  if (requestedMinor > f.disbursable) return { allowed: false, reason: "exceeds_disbursable" };
  return { allowed: true };
}

/** Release specifically also requires the authoritative snapshot. */
export function canRelease(f: CanonicalFinancials, requestedMinor: Minor): DisburseCheck {
  if (f.seller_release_amount === null) {
    return { allowed: false, reason: "missing_seller_payout_snapshot" };
  }
  return canDisburse(f, requestedMinor);
}

/**
 * A completed payout must carry a trustworthy completion timestamp. Nothing is
 * fabricated or inferred: only an authoritative provider/audit timestamp may
 * supply the value.
 */
export function payoutCompletionDisplay(
  row: PayoutRow,
): { value: string | null; needs_review: boolean } {
  if (row.status !== "completed") return { value: row.completed_at ?? null, needs_review: false };
  const authoritative = row.completed_at ?? row.provider_completed_at ?? null;
  if (!authoritative) return { value: null, needs_review: true };
  return { value: authoritative, needs_review: false };
}

/* ------------------------------------------------------------------ *
 * Pending-release SLA (threshold injected from system_settings)
 * ------------------------------------------------------------------ */

export function pendingReleaseSlaState(args: {
  pendingSinceIso: string | null | undefined;
  targetHours: number;
  nowIso?: string;
}): "normal" | "requires_review" {
  if (!args.pendingSinceIso) return "normal";
  if (!Number.isFinite(args.targetHours) || args.targetHours <= 0) return "normal";
  const since = Date.parse(args.pendingSinceIso);
  const now = args.nowIso ? Date.parse(args.nowIso) : Date.now();
  if (!Number.isFinite(since) || !Number.isFinite(now)) return "requires_review";
  return now - since > args.targetHours * 3600_000 ? "requires_review" : "normal";
}
