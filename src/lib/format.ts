/**
 * Centralized money formatter for SafeDeal.
 *
 * RULE: every monetary value displayed on a seller or buyer surface MUST be
 * routed through `formatMoney`. We always render exactly 2 decimal places to
 * eliminate the "rounded to nearest thousand" defects we used to ship with
 * `minimumFractionDigits: 0`.
 *
 * Do NOT introduce a new `Intl.NumberFormat` call elsewhere in the codebase
 * with `minimumFractionDigits: 0` — keep money formatting in this one file.
 */

const NGN_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimalCache = new Map<string, Intl.NumberFormat>();

function decimalFormatter(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  let f = decimalCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-NG", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    decimalCache.set(key, f);
  }
  return f;
}

function safe(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 0;
  return Number(amount);
}

/**
 * Render an amount with exactly 2 decimal places.
 *
 * - NGN  -> "₦1,234.50"
 * - USD  -> "USD 12.00"  (style:"decimal" + currency-code prefix to avoid Intl
 *          substituting "$"-style symbols in the en-NG locale)
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string = "NGN",
): string {
  const value = safe(amount);
  const code = (currency || "NGN").toUpperCase();
  if (code === "NGN") {
    return NGN_FORMATTER.format(value);
  }
  return `${code} ${decimalFormatter(code).format(value)}`;
}

/**
 * Compact form for tight KPI tiles. Below 1,000,000 we still emit 2dp; above
 * that we collapse to "1.2M" style. Call sites SHOULD pair this with a tooltip
 * carrying the exact `formatMoney(amount, currency)` value.
 */
export function formatMoneyCompact(
  amount: number | null | undefined,
  currency: string = "NGN",
): string {
  const value = safe(amount);
  const code = (currency || "NGN").toUpperCase();
  const abs = Math.abs(value);
  if (abs < 1_000_000) {
    return formatMoney(value, code);
  }
  const sign = value < 0 ? "-" : "";
  let scaled: string;
  if (abs >= 1_000_000_000) {
    scaled = `${(abs / 1_000_000_000).toFixed(1)}B`;
  } else {
    scaled = `${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (code === "NGN") return `${sign}₦${scaled}`;
  return `${code} ${sign}${scaled}`;
}

/** Render a signed delta (e.g. payout / refund rows). */
export function formatMoneyDelta(
  amount: number | null | undefined,
  currency: string = "NGN",
): string {
  const value = safe(amount);
  if (value === 0) return formatMoney(0, currency);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}