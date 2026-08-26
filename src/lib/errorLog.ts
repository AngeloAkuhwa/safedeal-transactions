/**
 * Client error reporting.
 *
 * The product takes live payments and had no error visibility at all: an
 * exception on the checkout page was learned about from a buyer complaining,
 * if ever. This is the client half of the pipeline that fixes that.
 *
 * The rule the whole file is written around: **the reporter must never make
 * things worse.** It is called from an error boundary and from global handlers,
 * which is to say it is called precisely when the app is already broken. Every
 * function here swallows its own failures, and none of them can throw into the
 * caller. A reporter that takes the page down while reporting is worse than
 * the error it was reporting.
 *
 * Correlation is the other half. Every edge call mints an id and sends it as a
 * header; the edge function logs its own failures under the same id. So a
 * buyer seeing "payment failed" and the stack from `initiate-paystack-payment`
 * are one query apart rather than a guess by timestamp.
 */

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "sd-error-session";
const DEDUPE_WINDOW_MS = 60_000;
/** Per session, per minute. A render loop is the realistic flood and it is
 *  cheap to emit thousands; this is the client half of stopping that. */
const MAX_REPORTS_PER_MINUTE = 20;

export type ErrorSource = "client" | "edge";
export type ErrorSeverity = "warning" | "error" | "fatal";

export interface ErrorReport {
  kind: string;
  message: string;
  stack?: string | null;
  severity?: ErrorSeverity;
  source?: ErrorSource;
  route?: string | null;
  functionName?: string | null;
  httpStatus?: number | null;
  correlationId?: string | null;
  context?: Record<string, unknown>;
}

/** Best-effort uuid. crypto.randomUUID is not present in every browser this
 *  app supports, and the fallback only has to be unique enough to join two
 *  rows, not to be unguessable. */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = newId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, or storage disabled. An unstable id costs us dedupe
    // across reloads, which is survivable; throwing here is not.
    return "no-storage";
  }
}

/**
 * Group a recurring defect into one row.
 *
 * Numbers, uuids and quoted values are stripped from the message before
 * hashing, because "Failed to load product 8f21" and "...product 4c09" are one
 * defect and must not become two thousand rows. The top stack frame is
 * included so the same generic message thrown from two places stays two.
 */
export function fingerprintOf(kind: string, message: string, stack?: string | null): string {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    // Short hex ids (a truncated key, a Paystack reference) are neither uuids
    // nor digit runs, and this project prints them constantly. Without this,
    // "Failed to load product 8f21b0c4" was its own row per product, which is
    // the exact failure the fingerprint exists to prevent. Requiring at least
    // one digit keeps real words out: "facade" and "decade" are valid hex.
    .replace(/\b(?=[0-9a-f]{6,}\b)(?=[0-9a-f]*\d)[0-9a-f]+\b/gi, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/["'`][^"'`]{0,80}["'`]/g, "<str>")
    .slice(0, 200);
  const topFrame = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ")) ?? "";
  const basis = `${kind}|${normalised}|${topFrame.slice(0, 120)}`;

  // djb2. Not cryptographic and does not need to be: this groups rows, it
  // does not protect anything.
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  return `c${(hash >>> 0).toString(36)}`;
}

const lastSeen = new Map<string, number>();
let windowStart = Date.now();
let sentThisWindow = 0;

function allowed(fingerprint: string): boolean {
  const now = Date.now();

  if (now - windowStart > 60_000) {
    windowStart = now;
    sentThisWindow = 0;
  }
  if (sentThisWindow >= MAX_REPORTS_PER_MINUTE) return false;

  const previous = lastSeen.get(fingerprint);
  if (previous && now - previous < DEDUPE_WINDOW_MS) return false;

  lastSeen.set(fingerprint, now);
  sentThisWindow += 1;

  // Unbounded growth would be its own leak in a long session.
  if (lastSeen.size > 200) {
    for (const [key, at] of lastSeen) {
      if (now - at > DEDUPE_WINDOW_MS) lastSeen.delete(key);
    }
  }
  return true;
}

function endpoint(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base}/functions/v1/log-error` : null;
}

/**
 * Report one error. Never throws, never returns a rejected promise.
 *
 * Fire and forget on purpose: an awaited reporter would make every catch block
 * slower and could deadlock a page that is already failing.
 */
export function reportError(report: ErrorReport): void {
  try {
    const fingerprint = fingerprintOf(report.kind, report.message, report.stack);
    if (!allowed(fingerprint)) return;

    const url = endpoint();
    if (!url) return;

    const payload = {
      occurred_at: new Date().toISOString(),
      correlation_id: report.correlationId ?? null,
      source: report.source ?? "client",
      severity: report.severity ?? "error",
      kind: report.kind,
      message: report.message,
      stack: report.stack ?? null,
      route: report.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      function_name: report.functionName ?? null,
      http_status: report.httpStatus ?? null,
      session_id: sessionId(),
      release: import.meta.env.VITE_APP_RELEASE ?? null,
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
      context: report.context ?? {},
      fingerprint,
    };

    const body = JSON.stringify(payload);
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    void (async () => {
      try {
        // The access token, when there is one, lets the server attribute the
        // report to an account. Absent or expired is fine and common: the
        // errors worth having most are the ones around a broken sign-in.
        let auth = anonKey;
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) auth = data.session.access_token;
        } catch {
          /* degraded auth is exactly when we still want the report */
        }

        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey ?? "",
            Authorization: `Bearer ${auth ?? ""}`,
          },
          body,
          keepalive: true,
        });
      } catch {
        /* the network is the thing that failed; there is nowhere left to say so */
      }
    })();
  } catch {
    /* reporting must never surface */
  }
}

/**
 * Wrap an edge function call so a failure is logged with a correlation id the
 * function also logged against. Returns exactly what the caller would have
 * got, so it can be dropped in without changing call sites' behaviour.
 */
export async function withErrorLog<T>(
  functionName: string,
  run: (correlationId: string) => Promise<T>,
): Promise<T> {
  const correlationId = newId();
  try {
    return await run(correlationId);
  } catch (err) {
    const e = err as { message?: string; status?: number; stack?: string };
    reportError({
      kind: "edge_call_failed",
      message: e?.message ?? String(err),
      stack: e?.stack ?? null,
      functionName,
      httpStatus: typeof e?.status === "number" ? e.status : null,
      correlationId,
      severity: "error",
      context: { function: functionName },
    });
    throw err;
  }
}

let installed = false;

/**
 * Global handlers. Catches what React's boundary structurally cannot: errors
 * in event handlers, in timers, and promise rejections nobody caught.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Resource load failures (an <img> 404) arrive here with no Error object
    // and are noise at this severity; the raw-img and audit guards cover those.
    if (!event.error && !event.message) return;
    reportError({
      kind: "window_error",
      message: event.message || String(event.error),
      stack: event.error?.stack ?? null,
      severity: "error",
      context: {
        filename: event.filename ?? null,
        line: event.lineno ?? null,
        column: event.colno ?? null,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    const message =
      typeof reason === "string" ? reason : reason?.message ?? "Unhandled promise rejection";
    reportError({
      kind: "unhandled_rejection",
      message,
      stack: typeof reason === "object" ? reason?.stack ?? null : null,
      severity: "error",
    });
  });
}
