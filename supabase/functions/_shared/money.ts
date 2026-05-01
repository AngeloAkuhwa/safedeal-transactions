/**
 * Convert a NGN naira amount to kobo (integer minor units).
 * Rounds to the nearest kobo to defend against floating-point drift on
 * fee/amount math upstream.
 */
export function nairaToKobo(naira: number | string): number {
  const n = typeof naira === "string" ? Number(naira) : naira;
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid_amount");
  return Math.round(n * 100);
}

export function koboToNaira(kobo: number | string): number {
  const k = typeof kobo === "string" ? Number(kobo) : kobo;
  if (!Number.isFinite(k)) throw new Error("invalid_amount");
  return Math.round(k) / 100;
}