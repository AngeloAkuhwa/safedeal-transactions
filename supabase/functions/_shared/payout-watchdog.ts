/**
 * Stuck-payout detection. A payout is "stuck" when it claims to be in flight
 * (pending/processing) but has no provider reference at all. Meaning nothing
 * was ever handed to Paystack: and it has been that way past the threshold.
 *
 * Detection ONLY. Nothing here mutates money_status or escrow state.
 */
export const WATCHDOG_IN_FLIGHT_STATUSES = ["pending", "processing"] as const;
export const WATCHDOG_STUCK_HOURS_KEY = "payouts.watchdog_stuck_hours";
export const DEFAULT_STUCK_HOURS = 6;
/** Do not re-alert the same payout more often than this. */
export const ALERT_COOLDOWN_HOURS = 24;

export interface WatchdogPayout {
  status?: string | null;
  provider_reference?: string | null;
  initiated_at?: string | null;
  created_at?: string | null;
  watchdog_alerted_at?: string | null;
}

export function parseStuckHours(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STUCK_HOURS;
  return n;
}

/** Age of the payout's in-flight clock, in hours. */
export function payoutAgeHours(p: WatchdogPayout, now: Date = new Date()): number {
  const since = p.initiated_at ?? p.created_at;
  if (!since) return 0;
  const t = Date.parse(since);
  if (Number.isNaN(t)) return 0;
  return (now.getTime() - t) / 3_600_000;
}

export function isStuckPayout(
  p: WatchdogPayout,
  thresholdHours: number = DEFAULT_STUCK_HOURS,
  now: Date = new Date(),
): boolean {
  if (!p.status || !(WATCHDOG_IN_FLIGHT_STATUSES as readonly string[]).includes(p.status)) {
    return false;
  }
  if (p.provider_reference) return false;
  return payoutAgeHours(p, now) >= thresholdHours;
}

/** True when we may raise a fresh ops alert for this payout. */
export function shouldAlert(
  p: WatchdogPayout,
  now: Date = new Date(),
  cooldownHours: number = ALERT_COOLDOWN_HOURS,
): boolean {
  if (!p.watchdog_alerted_at) return true;
  const t = Date.parse(p.watchdog_alerted_at);
  if (Number.isNaN(t)) return true;
  return (now.getTime() - t) / 3_600_000 >= cooldownHours;
}

export function stuckCutoffIso(thresholdHours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - thresholdHours * 3_600_000).toISOString();
}
