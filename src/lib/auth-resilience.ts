/**
 * Telling "you are not allowed" apart from "we could not find out".
 *
 * The auth layer degraded twice in one week: 11.5 hours of flapping 504s on
 * `/auth/v1/token` on 2026-08-24, and again on 2026-08-25 with calls taking
 * 42s, 2m20s and 3m00s before failing. Postgres stayed healthy throughout, so
 * every session token in every browser was still perfectly valid. The service
 * that confirms them was not.
 *
 * The app answered that by treating silence as a verdict. A failed role lookup
 * left `roles ?? []` empty, which reads as "this person has no role", which
 * sends an established seller to the role picker. A 5xx from `getUser` set
 * `isAuthenticated` false, which reads as "signed out", which bounces a buyer
 * out of checkout. Neither is a thing the server said. Both are what the
 * client concluded from not being answered.
 *
 * So there are three outcomes here, not two:
 *
 *   ok          the service answered
 *   denied      the service answered, and the answer is no (400/401/403)
 *   unavailable the service did not answer, and we know nothing
 *
 * `unavailable` must never be rendered as `denied`. It is retried, bounded by
 * a timeout so a three minute hang becomes a fast second attempt, reported to
 * the error log so the next incident is visible while it happens rather than
 * reconstructed afterwards, and finally shown to the person as what it is.
 *
 * What this cannot do: fix the auth service. That is Supabase's, and it is
 * raised with them (plan 7.4). This is the app surviving it.
 */

import { reportError, newId } from "@/lib/errorLog";

export type AuthOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "denied"; status: number | null; message: string }
  | { kind: "unavailable"; attempts: number; message: string };

/** Per attempt. The incident's slowest observed call was three minutes; a
 *  caller waiting that long has already given up, and a second attempt is
 *  worth more than a first one that is still hanging. */
const ATTEMPT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
/** Backoff before attempts 2 and 3. Short, because someone is watching a
 *  spinner, and jittered so a page with several auth calls does not retry
 *  them all in the same instant and re-create the pile-up. */
const BACKOFF_MS = [400, 1_200];

/**
 * A verdict, or a failure to reach one.
 *
 * Status is what settles it. 400, 401 and 403 are the service answering: a
 * wrong password, a revoked refresh token, a role the caller does not hold.
 * Everything else, including no status at all, means we did not get an answer:
 * 408, 429, every 5xx, a network error, an abort.
 *
 * Note which way the default falls. An unrecognised failure is treated as
 * `unavailable`, not `denied`, because the cost is asymmetric: retrying a
 * genuine refusal wastes two requests, while refusing a genuine user locks
 * them out of their own money.
 */
export function isDeniedError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (!e) return false;

  const status =
    typeof e.status === "number"
      ? e.status
      : typeof (e as { context?: { status?: number } }).context?.status === "number"
        ? (e as { context: { status: number } }).context.status
        : null;

  if (status === 400 || status === 401 || status === 403) return true;

  // GoTrue names its refusals. These arrive as 400s already, but the code is
  // the more durable signal and costs nothing to check.
  const code = String(e.code ?? "");
  if (/invalid_grant|invalid_credentials|user_not_found|email_not_confirmed/i.test(code)) {
    return true;
  }
  return false;
}

function statusOf(error: unknown): number | null {
  const e = error as { status?: number; context?: { status?: number } } | null;
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.context?.status === "number") return e.context.status;
  return null;
}

const messageOf = (error: unknown): string => {
  const e = error as { message?: string } | null;
  return e?.message ?? String(error ?? "unknown");
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Bound a promise. Supabase's client has no per-call timeout, so a hung
 * request hangs the caller for as long as the socket stays open, which during
 * the incident meant minutes of spinner with no way out.
 */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { status: 408 })),
      ms,
    );
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Run an auth or authorisation call and come back with one of the three
 * outcomes above.
 *
 * `run` may either throw or resolve to a `{ data, error }` pair, because
 * supabase-js does both depending on the call. Both shapes are handled, since
 * missing one of them is how a real failure would slip through as a success
 * with empty data, which is the exact defect this file exists to prevent.
 */
export async function resilientAuthCall<T>(
  label: string,
  run: () => Promise<{ data: T; error: unknown } | T>,
  opts?: { attempts?: number; timeoutMs?: number; correlationId?: string },
): Promise<AuthOutcome<T>> {
  const attempts = opts?.attempts ?? MAX_ATTEMPTS;
  const timeoutMs = opts?.timeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const correlationId = opts?.correlationId ?? newId();
  let lastMessage = "no attempt was made";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await withTimeout(Promise.resolve(run()), timeoutMs, label);

      const pair = result as { data?: T; error?: unknown };
      const hasPair = pair && typeof pair === "object" && "error" in pair;
      const error = hasPair ? pair.error : null;

      if (!error) {
        return { kind: "ok", value: (hasPair ? pair.data : result) as T };
      }
      if (isDeniedError(error)) {
        return { kind: "denied", status: statusOf(error), message: messageOf(error) };
      }
      lastMessage = messageOf(error);
    } catch (thrown) {
      if (isDeniedError(thrown)) {
        return { kind: "denied", status: statusOf(thrown), message: messageOf(thrown) };
      }
      lastMessage = messageOf(thrown);
    }

    if (attempt < attempts) {
      const base = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await sleep(base + Math.floor(Math.random() * 250));
    }
  }

  // Every attempt failed without an answer. This is the shape of the incident,
  // and it is worth a fatal: a signed-in person is about to be told something
  // untrue about their own account.
  reportError({
    kind: "auth_unavailable",
    message: `${label}: ${lastMessage}`,
    severity: "fatal",
    correlationId,
    context: { label, attempts, timeout_ms: timeoutMs },
  });
  markAuthDegraded();

  return { kind: "unavailable", attempts, message: lastMessage };
}

/**
 * A single shared belief about whether the auth layer is currently answering,
 * so several components can show one consistent state rather than each
 * discovering the outage separately.
 *
 * Deliberately not React state: it is written from inside async helpers that
 * are not components, and the subscribers are few.
 */
type AuthHealth = "ok" | "degraded";
let health: AuthHealth = "ok";
const listeners = new Set<(h: AuthHealth) => void>();
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

/** How long a degraded reading stands before the app assumes recovery. The
 *  next successful call clears it sooner; this only bounds the banner when
 *  nothing else happens to be asking. */
const DEGRADED_TTL_MS = 60_000;

function setHealth(next: AuthHealth) {
  if (health === next) return;
  health = next;
  for (const l of listeners) l(next);
}

export function markAuthDegraded() {
  setHealth("degraded");
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => setHealth("ok"), DEGRADED_TTL_MS);
}

export function markAuthHealthy() {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  setHealth("ok");
}

export function getAuthHealth(): AuthHealth {
  return health;
}

export function subscribeAuthHealth(listener: (h: AuthHealth) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam. The module-level belief would otherwise leak between cases. */
export function __resetAuthHealth() {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  health = "ok";
  listeners.clear();
}
