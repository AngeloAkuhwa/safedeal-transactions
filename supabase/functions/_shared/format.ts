/**
 * Edge-function mirror of `src/lib/format.ts`.
 * Used for CSV exports + notification copy so backend output matches the UI.
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

export function formatMoney(
  amount: number | null | undefined,
  currency = "NGN",
): string {
  const value =
    amount === null || amount === undefined || Number.isNaN(amount)
      ? 0
      : Number(amount);
  const code = (currency || "NGN").toUpperCase();
  if (code === "NGN") return NGN.format(value);
  return `${code} ${DECIMAL_2.format(value)}`;
}

/** CSV-safe variant: no currency symbol, just `1234.50` (still 2 dp). */
export function formatMoneyCsv(amount: number | null | undefined): string {
  const value =
    amount === null || amount === undefined || Number.isNaN(amount)
      ? 0
      : Number(amount);
  return value.toFixed(2);
}