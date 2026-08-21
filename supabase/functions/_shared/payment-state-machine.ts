/**
 * SafeDeal Payment State Machine: JS mirror of the DB transition matrix.
 *
 * Source of truth is still the DB triggers in migrations 013/014 (which raise
 * on invalid transitions). This module exists so edge functions can fail-fast
 * with a friendly error BEFORE hitting the database, and so admin UIs can
 * preview whether an action is legal.
 *
 * If you add a new status, update the matrix here AND the DB trigger.
 */

/* ---------- TRANSACTION STATUS ---------- */

export type TxStatus =
  | "draft"
  | "awaiting_buyer"
  | "awaiting_payment"
  | "payment_secured"
  | "seller_preparing_delivery"
  | "seller_dispatched"
  | "delivered_awaiting_verification"
  | "disputed"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "refunded"
  | "resolved";

export const TX_TRANSITIONS: Record<TxStatus, TxStatus[]> = {
  draft: ["awaiting_buyer", "cancelled"],
  awaiting_buyer: ["awaiting_payment", "cancelled", "timed_out"],
  awaiting_payment: ["payment_secured", "cancelled", "timed_out"],
  payment_secured: ["seller_preparing_delivery", "disputed", "cancelled", "refunded"],
  seller_preparing_delivery: ["seller_dispatched", "disputed", "cancelled"],
  seller_dispatched: ["delivered_awaiting_verification", "disputed"],
  delivered_awaiting_verification: ["completed", "disputed"],
  disputed: ["resolved", "refunded"],
  resolved: ["completed", "refunded"],
  completed: [],
  cancelled: [],
  timed_out: ["cancelled"],
  refunded: [],
};

/* ---------- MONEY STATUS ---------- */

export type MoneyStatus =
  | "not_secured"
  | "payment_pending"
  | "funds_held_in_escrow"
  | "funds_pending_release"
  | "funds_releasing"
  | "funds_released"
  | "funds_frozen"
  | "refund_pending"
  | "refund_issued";

export const MONEY_TRANSITIONS: Record<MoneyStatus, MoneyStatus[]> = {
  not_secured: ["payment_pending"],
  payment_pending: ["not_secured", "funds_held_in_escrow"],
  funds_held_in_escrow: ["funds_pending_release", "funds_frozen", "refund_pending"],
  funds_pending_release: ["funds_releasing", "funds_frozen", "refund_pending"],
  funds_releasing: ["funds_released", "funds_pending_release", "funds_frozen"],
  funds_frozen: ["funds_pending_release", "refund_pending"],
  refund_pending: ["refund_issued", "funds_held_in_escrow"],
  refund_issued: [],
  funds_released: [],
};

/* ---------- DISPUTE STATUS ---------- */

export type DisputeStatus =
  | "open"
  | "seller_response_pending"
  | "under_review"
  | "resolved";

export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["seller_response_pending", "under_review", "resolved"],
  seller_response_pending: ["under_review", "resolved"],
  under_review: ["resolved"],
  resolved: [],
};

/* ---------- PAYOUT STATUS ---------- */

export type PayoutStatus =
  | "awaiting_release"
  | "blocked"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "reversed";

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  awaiting_release: ["pending", "processing", "blocked", "cancelled"],
  blocked: ["awaiting_release", "cancelled"],
  pending: ["processing", "completed", "failed", "cancelled"],
  processing: ["completed", "failed", "reversed"],
  failed: ["pending", "processing", "cancelled"],
  reversed: ["pending", "cancelled"],
  completed: ["reversed"],
  cancelled: [],
};

/* ---------- Helpers ---------- */

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: "terminal" | "illegal_transition" | "unknown_status"; from: string; to: string };

function check<S extends string>(matrix: Record<S, S[]>, from: S, to: S): TransitionResult {
  if (from === to) return { ok: true };
  const allowed = matrix[from];
  if (!allowed) return { ok: false, reason: "unknown_status", from, to };
  if (allowed.length === 0) return { ok: false, reason: "terminal", from, to };
  if (!allowed.includes(to)) return { ok: false, reason: "illegal_transition", from, to };
  return { ok: true };
}

export const canTransitionTx = (from: TxStatus, to: TxStatus) => check(TX_TRANSITIONS, from, to);
export const canTransitionMoney = (from: MoneyStatus, to: MoneyStatus) => check(MONEY_TRANSITIONS, from, to);
export const canTransitionDispute = (from: DisputeStatus, to: DisputeStatus) => check(DISPUTE_TRANSITIONS, from, to);
export const canTransitionPayout = (from: PayoutStatus, to: PayoutStatus) => check(PAYOUT_TRANSITIONS, from, to);