/**
 * Payment-flow money formatter.
 *
 * Thin wrapper around `src/lib/format.ts` that:
 *  - Requires a currency, and renders `—` when it is unknown (NEVER invents one)
 *  - Renders `—` for null/undefined values (NEVER fake `₦0.00`)
 *
 * USE THIS in every pricing/refund/payout breakdown to satisfy the acceptance
 * criterion "Missing pricing values show —, not fake zero".
 */

import { formatMoney as baseFormatMoney } from "@/lib/format";

export const MISSING_MONEY = "—";

export function formatMoneyOrDash(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount as number) || !currency) {
    return MISSING_MONEY;
  }
  return baseFormatMoney(amount, currency);
}

/** Mask a bank account number for display: `****1234`. */
export function maskAccountNumber(account: string | null | undefined): string {
  if (!account) return MISSING_MONEY;
  const trimmed = String(account).replace(/\s+/g, "");
  if (trimmed.length <= 4) return `****${trimmed}`;
  return `****${trimmed.slice(-4)}`;
}

// Re-export the canonical formatter so callers don't have to import from two
// places.
export { formatMoney } from "@/lib/format";