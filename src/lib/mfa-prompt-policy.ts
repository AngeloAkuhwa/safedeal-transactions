/**
 * Consumer 2FA prompting policy.
 *
 * HARD RULE: no consumer route may ever trigger a step-up or a 2FA prompt.
 * Buyers and sellers are only ever offered 2FA, never blocked by it, and never
 * on a money or dispute path. This deny-list is asserted by contract tests.
 */
export const PROMPT_DENY_PREFIXES = [
  "/cart",
  "/checkout",
  "/payment",
  "/pay",
  "/transaction",
  "/transactions",
  "/dispute",
  "/disputes",
  "/offer",
  "/delivery",
  "/auth",
  "/reset-password",
  "/role-selection",
];

export const PROMPT_INTERVAL_DAYS = 30;
export const PROMPT_DISMISS_KEY = "safedeal_2fa_prompt_dismissed_until";

/** True when the path must never show a 2FA prompt or step-up. */
export function isPromptDeniedPath(pathname: string): boolean {
  const p = (pathname || "/").toLowerCase();
  return PROMPT_DENY_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.includes(prefix),
  );
}

export function isPromptSnoozed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PROMPT_DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function snoozePrompt(now: number = Date.now()): void {
  try {
    localStorage.setItem(
      PROMPT_DISMISS_KEY,
      String(now + PROMPT_INTERVAL_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    /* storage unavailable: prompt simply reappears next session */
  }
}