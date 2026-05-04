import type { AdminTxRow } from "@/services/admin-transactions-monitor.service";

/**
 * Returns a className for a transaction row that visually highlights its
 * state (frozen / disputed / high-risk) with a left border + subtle bg.
 * Color is paired with icons in the row, so it's not the only signal.
 */
export function rowStateClass(t: AdminTxRow): string {
  if (t.isFrozen) return "border-l-2 border-l-cyan-500/60 bg-cyan-500/[0.04]";
  if (t.transactionStatus.key === "in_dispute")
    return "border-l-2 border-l-orange-500/60 bg-orange-500/[0.04]";
  if (t.riskLevel === "high_risk" || t.riskLevel === "fraud_watch")
    return "border-l-2 border-l-red-500/60 bg-red-500/[0.04]";
  return "border-l-2 border-l-transparent";
}

export type EmptyVariantKey = "no-data" | "no-search" | "no-filtered" | "no-disputes" | "no-flagged";

export function pickEmptyVariant(args: {
  hasSearch: boolean;
  hasFilters: boolean;
  quick: string;
}): EmptyVariantKey {
  if (args.quick === "in_dispute") return "no-disputes";
  if (args.quick === "flagged") return "no-flagged";
  if (args.hasSearch) return "no-search";
  if (args.hasFilters) return "no-filtered";
  return "no-data";
}