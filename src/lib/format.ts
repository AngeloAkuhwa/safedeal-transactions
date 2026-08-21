/**
 * Centralized money formatter for SafeDeal.
 *
 * RULE: every monetary value displayed on a seller or buyer surface MUST be
 * routed through `formatMoney`. We always render exactly 2 decimal places to
 * eliminate the "rounded to nearest thousand" defects we used to ship with
 * `minimumFractionDigits: 0`.
 *
 * Do NOT introduce a new `Intl.NumberFormat` call elsewhere in the codebase
 * with `minimumFractionDigits: 0`: keep money formatting in this one file.
 *
 * `currency` is a REQUIRED parameter on every helper here. It used to default
 * to "NGN", which quietly re-introduced the invented-currency defect at every
 * call site that omitted it (a seller settling in another currency read their
 * whole payouts page in Naira). The type system is the enforcement mechanism:
 * if a currency genuinely isn't known, use `formatMoneyOrDash` or render `—`
 * rather than guessing one.
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

/**
 * Rendered when an amount is absent. Money NEVER falls back to zero: a missing
 * figure must look missing, because `₦0.00` reads as a real, provable amount to
 * whoever is about to move money.
 */
export const MISSING_AMOUNT = "—";

function isMissing(amount: number | null | undefined): boolean {
  return amount === null || amount === undefined || Number.isNaN(Number(amount));
}

/**
 * Upper-cases a currency code. An empty/blank code is NOT silently promoted to
 * a currency: it renders as a bare number, so a missing code looks missing
 * instead of looking like Naira.
 */
function normalizeCurrency(currency: string): string {
  return (currency || "").trim().toUpperCase();
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
  currency: string,
): string {
  if (isMissing(amount)) return MISSING_AMOUNT;
  const value = Number(amount);
  const code = normalizeCurrency(currency);
  if (code === "NGN") {
    return NGN_FORMATTER.format(value);
  }
  const rendered = decimalFormatter(code).format(value);
  return code ? `${code} ${rendered}` : rendered;
}

/**
 * Compact form for tight KPI tiles. Below 1,000,000 we still emit 2dp; above
 * that we collapse to "1.2M" style. Call sites SHOULD pair this with a tooltip
 * carrying the exact `formatMoney(amount, currency)` value.
 */
export function formatMoneyCompact(
  amount: number | null | undefined,
  currency: string,
): string {
  if (isMissing(amount)) return MISSING_AMOUNT;
  const value = Number(amount);
  const code = normalizeCurrency(currency);
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
  return code ? `${code} ${sign}${scaled}` : `${sign}${scaled}`;
}

/** Render a signed delta (e.g. payout / refund rows). */
export function formatMoneyDelta(
  amount: number | null | undefined,
  currency: string,
): string {
  if (isMissing(amount)) return MISSING_AMOUNT;
  const value = Number(amount);
  if (value === 0) return formatMoney(0, currency);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

/** Mask an email like `jo•@g•••l.com`. Returns "—" when empty. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const m = (s: string) =>
    s.length <= 2 ? s[0] + "•" : s[0] + "•".repeat(Math.max(1, s.length - 2)) + s[s.length - 1];
  const [dName, ...dRest] = domain.split(".");
  return `${m(name)}@${m(dName)}${dRest.length ? "." + dRest.join(".") : ""}`;
}

/** Mask a phone number, keeping the first 2 and last 4 digits. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.length < 7) return phone;
  return phone.slice(0, 2) + "•".repeat(phone.length - 6) + phone.slice(-4);
}