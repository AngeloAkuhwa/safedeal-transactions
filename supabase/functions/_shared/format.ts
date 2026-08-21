/**
 * Edge-function mirror of `src/lib/format.ts`.
 * Used for CSV exports + notification copy so backend output matches the UI.
 *
 * `currency` is REQUIRED, exactly as on the client. It used to default to
 * "NGN", which quietly invented a currency at every call site that omitted it
 *: notification and receipt copy renders to a person just like a component
 * does. If a currency genuinely isn't known, render `—` (see
 * `formatMoneyOrDash`) rather than guessing one.
 */

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL_2 = new Intl.NumberFormat("en-NG", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money never falls back to zero: a missing amount renders as `—`. */
export const MISSING_AMOUNT = "—";

export function formatMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return MISSING_AMOUNT;
  }
  const value = Number(amount);
  const code = (currency || "").trim().toUpperCase();
  if (code === "NGN") return NGN.format(value);
  const rendered = DECIMAL_2.format(value);
  return code ? `${code} ${rendered}` : rendered;
}

/** Renders `—` when the amount or the currency is unknown. Never invents either. */
export function formatMoneyOrDash(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount)) || !currency) {
    return MISSING_AMOUNT;
  }
  return formatMoney(Number(amount), currency);
}

/**
 * CSV-safe variant: no currency symbol, just `1234.50` (still 2 dp).
 * A missing amount yields an EMPTY cell. Writing `0.00` would state, in a
 * file someone reconciles against, that the figure was zero.
 */
export function formatMoneyCsv(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return "";
  }
  return Number(amount).toFixed(2);
}