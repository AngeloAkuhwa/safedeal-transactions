export type MoneyStatusKey =
  | "not_secured"
  | "payment_pending"
  | "funds_held_in_escrow"
  | "funds_pending_release"
  | "funds_releasing"
  | "funds_released"
  | "funds_frozen"
  | "refund_pending"
  | "refund_issued"
  | string;

export interface MoneyStatusMeta {
  label: string;
  tone: "neutral" | "info" | "warning" | "danger" | "success";
  classes: string;
}

export const MONEY_STATUS_META: Record<string, MoneyStatusMeta> = {
  not_secured: { label: "Not Secured", tone: "neutral", classes: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  payment_pending: { label: "Payment Pending", tone: "info", classes: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  funds_held_in_escrow: { label: "Held in Escrow", tone: "info", classes: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  funds_pending_release: { label: "Awaiting Release", tone: "info", classes: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  funds_releasing: { label: "Releasing", tone: "info", classes: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  funds_released: { label: "Released", tone: "success", classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  funds_frozen: { label: "Funds Frozen", tone: "danger", classes: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  refund_pending: { label: "Refund Pending", tone: "warning", classes: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  refund_issued: { label: "Refunded", tone: "neutral", classes: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

export function moneyStatusLabel(s?: string | null): string {
  if (!s) return "—";
  return MONEY_STATUS_META[s]?.label ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pick the active escrow value to display in the summary tile based on
 * money_status. Falls back to ledger-derived freeze amount when the escrow
 * snapshot reports 0 but ledger shows a freeze entry equal to buyer total.
 */
/** A number when the source actually recorded one; null renders as a dash. */
function amountOrNull(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || Number.isNaN(n) ? null : n;
}

/** First entry that is a recorded positive amount, else null: no zero is
 * ever invented for display, because the tile this feeds is an amount an
 * operator may act on. */
function firstPositive(...values: (number | null)[]): number | null {
  for (const v of values) if (v !== null && v > 0) return v;
  return null;
}

export function activeEscrowDisplay(
  moneyStatus: string | null | undefined,
  escrow: any,
  buyerTotal: number | null,
): { label: string; value: number | null } {
  const ms = moneyStatus ?? "";
  const held = amountOrNull(escrow?.heldAmount);
  const frozen = amountOrNull(escrow?.frozenAmount);
  const released = amountOrNull(escrow?.releasedAmount);
  const refunded = amountOrNull(escrow?.refundedAmount);
  if (ms === "funds_frozen") {
    let v = firstPositive(frozen);
    if (v === null) {
      const ledger = (escrow?.ledger ?? []) as any[];
      const freezeEntry = ledger.find((e) =>
        /freeze|frozen|hold/.test((e.entryType ?? "").toLowerCase()),
      );
      v = firstPositive(amountOrNull(freezeEntry?.amount), buyerTotal, held);
    }
    return { label: "Funds Frozen in Escrow", value: v };
  }
  if (ms === "funds_held_in_escrow") return { label: "Held in Escrow", value: held };
  if (ms === "funds_released") return { label: "Released to Seller", value: released };
  if (ms === "refund_issued") return { label: "Refunded to Buyer", value: refunded };
  if (ms === "refund_pending") return { label: "Refund Pending", value: firstPositive(held, frozen, buyerTotal) };
  if (ms === "funds_pending_release" || ms === "funds_releasing") return { label: "Awaiting Release", value: held };
  return { label: "Escrow", value: firstPositive(held, frozen) };
}