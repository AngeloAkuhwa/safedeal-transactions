/**
 * Shared admin label/format helpers.
 *
 * SINGLE SOURCE OF TRUTH for the labels/keys/tones rendered on both:
 *   - Admin Transaction Monitor (list/grid)
 *   - Admin Transaction Detail page
 *
 * A verbatim mirror of this file lives at
 *   supabase/functions/_shared/admin-mappers.ts
 * The two MUST stay in sync. This is guarded by exactly one test:
 * src/lib/__tests__/admin-mappers.test.ts (Vitest), which compares the two
 * files byte-for-byte after normalising comments and whitespace. There is no
 * Deno mirror test in the monitor function.
 *
 * Resolution rule for monitor vs detail:
 *   - `short` is what the monitor's compact column shows (e.g. "Held").
 *   - `label` is what the detail page shows (e.g. "Held in Escrow").
 *   - `key` is the stable internal token (e.g. "held"); both sides must
 *     produce the same key so the consistency check can compare them.
 */

export type Tone = "muted" | "info" | "warning" | "success" | "destructive";
export interface Mapped {
  key: string;
  label: string;
  short: string;
  tone: Tone;
}

const m = (key: string, label: string, short: string, tone: Tone): Mapped => ({ key, label, short, tone });

/* ---- Transaction status ---- */
export function mapTransactionStatus(s: string | null | undefined): Mapped {
  switch (s) {
    case "draft": return m("draft", "Draft", "Draft", "muted");
    case "awaiting_buyer": return m("awaiting_buyer", "Awaiting Buyer", "Awaiting Buyer", "muted");
    case "awaiting_payment": return m("awaiting_payment", "Awaiting Payment", "Awaiting Payment", "warning");
    case "payment_secured": return m("funds_held", "Funds Held", "Funds Held", "success");
    case "seller_preparing_delivery": return m("in_fulfillment", "In Fulfillment", "In Fulfillment", "info");
    case "seller_dispatched": return m("dispatched", "Dispatched", "Dispatched", "info");
    case "delivered_awaiting_verification": return m("delivered", "Delivered: Awaiting Verification", "Delivered", "warning");
    case "disputed": return m("in_dispute", "In Dispute", "In Dispute", "destructive");
    case "completed": return m("completed", "Completed", "Completed", "success");
    case "cancelled": return m("cancelled", "Cancelled", "Cancelled", "muted");
    case "timed_out": return m("failed", "Timed Out", "Timed Out", "muted");
    case "refunded": return m("refunded", "Refunded", "Refunded", "muted");
    case "resolved": return m("resolved", "Resolved", "Resolved", "success");
    default: return m(String(s ?? "unknown"), String(s ?? "—").replace(/_/g, " "), String(s ?? "—").replace(/_/g, " "), "muted");
  }
}

/* ---- Money status ---- */
export function mapMoneyStatus(s: string | null | undefined): Mapped {
  switch (s) {
    case "not_secured": return m("not_secured", "Not Secured", "Not Secured", "muted");
    case "payment_pending": return m("payment_pending", "Payment Pending", "Pending", "warning");
    case "funds_held_in_escrow": return m("held", "Held in Escrow", "Held", "info");
    case "funds_pending_release": return m("awaiting_release", "Awaiting Release", "Awaiting Release", "info");
    case "funds_releasing": return m("releasing", "Releasing", "Releasing", "info");
    case "funds_released": return m("released", "Released", "Released", "success");
    case "funds_frozen": return m("frozen", "Funds Frozen", "Frozen", "destructive");
    case "refund_pending": return m("refund_pending", "Refund Pending", "Refund Pending", "warning");
    case "refund_issued": return m("refunded", "Refunded", "Refunded", "muted");
    default: return m(String(s ?? "unknown"), String(s ?? "—").replace(/_/g, " "), String(s ?? "—").replace(/_/g, " "), "muted");
  }
}

/* ---- Dispute status ---- */
export function mapDisputeStatus(s: string | null | undefined): Mapped {
  switch (s) {
    case null:
    case undefined:
    case "":
    case "none": return m("none", "No Dispute", "None", "muted");
    case "open": return m("open", "Open", "Open", "warning");
    case "seller_response_pending": return m("awaiting_seller", "Awaiting Seller", "Awaiting Seller", "warning");
    case "under_review": return m("under_review", "Under Review", "Under Review", "info");
    case "resolved": return m("resolved", "Resolved", "Resolved", "success");
    default: return m(String(s), String(s).replace(/_/g, " "), String(s).replace(/_/g, " "), "muted");
  }
}

/* ---- Escrow state ---- */
export function mapEscrowState(s: string | null | undefined): Mapped {
  switch (s) {
    case "awaiting_payment": return m("pending", "Awaiting Payment", "Pending", "muted");
    case "held": return m("held", "Held in Escrow", "Held", "info");
    case "frozen": return m("frozen", "Funds Frozen", "Frozen", "destructive");
    case "releasing": return m("releasing", "Releasing", "Releasing", "info");
    case "released":
    case "released_to_seller": return m("released", "Released", "Released", "success");
    case "refunded":
    case "refunded_to_buyer": return m("refunded", "Refunded", "Refunded", "muted");
    default: return m("pending", "—", "—", "muted");
  }
}

/* ---- Payout status ---- */
export function mapPayoutStatus(s: string | null | undefined): Mapped {
  switch (s) {
    case "awaiting_release": return m("awaiting_release", "Awaiting Release", "Awaiting", "info");
    case "blocked": return m("blocked", "Blocked", "Blocked", "warning");
    case "pending": return m("pending", "Queued for Transfer", "Queued", "info");
    case "processing": return m("processing", "Transferring", "Transferring", "info");
    case "completed": return m("completed", "Paid Out", "Paid Out", "success");
    case "failed": return m("failed", "Transfer Failed", "Failed", "destructive");
    case "cancelled": return m("cancelled", "Cancelled", "Cancelled", "muted");
    case "reversed": return m("reversed", "Reversed", "Reversed", "destructive");
    default: return m(String(s ?? "none"), String(s ?? "—"), String(s ?? "—"), "muted");
  }
}

/* ---- Risk level ---- */
export type RiskLevel = "clean" | "escalated" | "high_risk" | "fraud_watch";

export function mapRiskLevel(input: {
  needsReleaseReview?: boolean | null;
  moneyStatus?: string | null;
  disputeStatus?: string | null;
  adminEscalated?: boolean;
  riskFlagged?: boolean;
}): { level: RiskLevel; tone: Tone; label: string } {
  const isFrozen = input.moneyStatus === "funds_frozen";
  const activeDispute =
    !!input.disputeStatus && ["open", "seller_response_pending", "under_review"].includes(input.disputeStatus);
  let level: RiskLevel = "clean";
  if ((input.needsReleaseReview || input.adminEscalated) && isFrozen) level = "fraud_watch";
  else if (input.needsReleaseReview || input.riskFlagged || input.adminEscalated) level = "high_risk";
  else if (activeDispute) level = "escalated";
  const meta: Record<RiskLevel, { tone: Tone; label: string }> = {
    clean: { tone: "muted", label: "Clean" },
    escalated: { tone: "warning", label: "Escalated" },
    high_risk: { tone: "destructive", label: "High Risk" },
    fraud_watch: { tone: "destructive", label: "Fraud Watch" },
  };
  return { level, ...meta[level] };
}

/* ---- Money formatter ---- */
/**
 * `currency` is REQUIRED. It used to default to "NGN", which invented a
 * currency at every call site that omitted it. Renders `—` when the amount is
 * missing, and a bare number when the code is blank. Never a guessed symbol.
 */
export function formatCurrencyNGN(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const code = (currency || "").trim().toUpperCase();
  if (!code) return n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/* ---- Last activity ---- */
export function getLastActivity(input: {
  updatedAt?: string | null;
  lastMoneyChangeAt?: string | null;
  lastEventAt?: string | null;
  lastStatusChangeAt?: string | null;
  lastPayoutAt?: string | null;
}): { iso: string | null; label: string; tone: "muted" | "warn" | "danger" } {
  const candidates = [
    input.updatedAt,
    input.lastMoneyChangeAt,
    input.lastEventAt,
    input.lastStatusChangeAt,
    input.lastPayoutAt,
  ]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((n) => Number.isFinite(n));
  const iso = candidates.length ? new Date(Math.max(...candidates)).toISOString() : input.updatedAt ?? null;
  if (!iso) return { iso: null, label: "—", tone: "muted" };
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  let label: string;
  if (mins < 1) label = "just now";
  else if (mins < 60) label = `${mins} min ago`;
  else if (mins < 60 * 24) label = `${Math.round(mins / 60)} hr ago`;
  else label = `${Math.round(mins / (60 * 24))} day(s) ago`;
  const days = diffMs / (1000 * 60 * 60 * 24);
  const tone: "muted" | "warn" | "danger" = days >= 3 ? "danger" : days >= 1 ? "warn" : "muted";
  return { iso, label, tone };
}

/* ---- Risk flags (detail page Risk & Investigation list) ---- */
export interface RiskFlag {
  label: string;
  severity: "low" | "medium" | "high";
}
export function buildRiskFlags(input: {
  needsReleaseReview?: boolean | null;
  releaseReviewReason?: string | null;
  moneyStatus?: string | null;
  disputeStatus?: string | null;
  disputeOverdue?: boolean | null;
  buyerFlagged?: boolean | null;
  sellerFlagged?: boolean | null;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.needsReleaseReview) {
    flags.push({ label: input.releaseReviewReason ?? "Needs admin review", severity: "high" });
  }
  if (input.moneyStatus === "funds_frozen") {
    flags.push({ label: "Funds frozen", severity: "high" });
  }
  if (input.disputeStatus && input.disputeStatus !== "none") {
    const d = mapDisputeStatus(input.disputeStatus);
    flags.push({ label: `Dispute: ${d.label}`, severity: "medium" });
  }
  if (input.disputeOverdue) {
    flags.push({ label: "Dispute response overdue", severity: "high" });
  }
  if (input.buyerFlagged) flags.push({ label: "Buyer account flagged", severity: "high" });
  if (input.sellerFlagged) flags.push({ label: "Seller account flagged", severity: "high" });
  return flags;
}