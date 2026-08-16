/**
 * An admin function must not answer a stranger.
 *
 * The 102 role-enforcement probes in `admin-auth.contract.test.ts` ask the live
 * backend a runtime question: does an anonymous caller get 401? This file asks
 * the structural one that runtime probing is bad at — is there any path through
 * the handler that produces a *considered* response before the caller has been
 * identified at all?
 *
 * Three functions had one. `admin-export-enqueue` parsed the body first so it
 * would know which export type to gate on, and in doing so replied
 * `unsupported_export_type` to callers it had never authenticated — sweep the
 * field and the set of supported values is the set that did NOT come back with
 * that error. `admin-dispute-transition` gave up `dispute_id_required`, then
 * `target_status_required`, then `reason_required`, walking an anonymous caller
 * through the shape of the request it wanted. `admin-transaction-actions`
 * answered `missing_fields`, and for two specific action names answered
 * something different, confirming those two actions exist.
 *
 * None of these leaked data. All of them answered a question the caller had no
 * standing to ask, and each answer narrows the next guess.
 *
 * The ordering is easy to reintroduce, because it looks like good practice:
 * validate input early, fail fast. It is good practice when the caller is
 * known. The rule this file enforces is narrower than "validate late" —
 *
 *   before the first `require*` call, a handler may return only
 *   401, 403, 405, or a CORS preflight.
 *
 * — which permits `await req.json().catch(() => ({}))` (parses early, answers
 * nothing) and forbids `catch { return json(400) }` (answers). Parsing is not
 * the sin; replying is.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FUNCTIONS = path.join(ROOT, "supabase/functions");

/**
 * Functions that are service-role only. They authenticate by comparing a
 * shared secret rather than by resolving a user, so `require*` never appears
 * and the rule above does not describe them.
 */
const SERVICE_ROLE_ONLY = new Set(["admin-export-worker"]);

/**
 * Ways a handler identifies its caller other than through `_shared/auth.ts`.
 *
 * `admin-agent-heartbeat` resolves the JWT itself with `auth.getUser` and
 * checks `is_internal_admin`. `admin-task-orchestration-action` has a
 * scheduler path that presents a shared secret in a header instead of a
 * session — a caller holding `CRON_SECRET` is identified, just not as a
 * person, so responses inside that branch are not responses to a stranger.
 *
 * The secret pattern is deliberately narrow: a header whose *name* contains
 * "secret". `SUPABASE_SERVICE_ROLE_KEY` appears in most of these files as the
 * credential the function uses to reach the database, which says nothing about
 * who called it, and must not be mistaken for a caller check.
 */
const INLINE_AUTH =
  /auth\.getUser\(|is_internal_admin|has_any_internal_role|headers\.get\(\s*["'][\w-]*secret[\w-]*["']\s*\)/i;

const AUTH_CALL = /\brequire(Admin|User|Permission|AnyPermission)\s*\(/;

function adminFunctions(): string[] {
  if (!fs.existsSync(FUNCTIONS)) return [];
  return fs
    .readdirSync(FUNCTIONS)
    .filter((n) => n.startsWith("admin-"))
    .filter((n) => !SERVICE_ROLE_ONLY.has(n))
    .filter((n) => fs.existsSync(path.join(FUNCTIONS, n, "index.ts")))
    .sort();
}

/**
 * The handler body, from `Deno.serve(` to the point where the caller is first
 * identified. Everything in this window runs for an anonymous caller.
 */
function preAuthWindow(src: string): string | null {
  const serve = src.indexOf("Deno.serve(");
  if (serve === -1) return null;
  const auth = src.slice(serve).search(AUTH_CALL);
  const inline = src.slice(serve).search(INLINE_AUTH);
  const candidates = [auth, inline].filter((i) => i >= 0);
  // No identification anywhere in the handler is itself the failure — return
  // the whole body so the assertion below reports on it.
  if (!candidates.length) return src.slice(serve);
  return src.slice(serve, serve + Math.min(...candidates));
}

/**
 * Statuses a handler may hand to someone it has not identified.
 *
 * 405 is here because refusing a method is a property of the URL, not of the
 * caller, and every one of these handlers checks it in its first two lines.
 * 200 is deliberately absent: the CORS preflight is stripped from the window
 * before scanning, so a 200 reaching this list means a real answer escaped.
 */
const ALLOWED = new Set([401, 403, 405]);

/** The OPTIONS preflight answers before auth by design; it carries no data. */
const stripPreflight = (s: string) =>
  s.replace(/if\s*\(\s*req\.method\s*===\s*["']OPTIONS["']\s*\)[^\n]*\n/g, "\n");

/**
 * Numeric statuses in returned responses. Both argument orders are in use in
 * this codebase — `json(body, status)` and `json(status, body)` — so match the
 * literal integers in the call and judge all of them.
 */
function returnedStatuses(window: string): number[] {
  const out: number[] = [];
  const re = /return\s+(?:json|new\s+Response)\s*\(([\s\S]*?)\);/g;
  for (const m of window.matchAll(re)) {
    for (const n of m[1].matchAll(/\b([1-5]\d\d)\b/g)) out.push(Number(n[1]));
  }
  return out;
}

describe("admin functions authenticate before they answer", () => {
  const fns = adminFunctions();

  it("finds the admin functions to check", () => {
    expect(fns.length).toBeGreaterThan(20);
  });

  describe.each(fns)("%s", (fn) => {
    const src = fs.readFileSync(path.join(FUNCTIONS, fn, "index.ts"), "utf8");

    it("identifies the caller somewhere in the handler", () => {
      const body = src.slice(src.indexOf("Deno.serve("));
      expect(
        AUTH_CALL.test(body) || INLINE_AUTH.test(body),
        `${fn} never resolves who is calling — every other guarantee here rests on this one`,
      ).toBe(true);
    });

    it("returns nothing but 401/403/405 before the caller is known", () => {
      const window = preAuthWindow(src);
      expect(window, `${fn} has no Deno.serve handler`).not.toBeNull();
      const offenders = returnedStatuses(stripPreflight(window!)).filter(
        (s) => !ALLOWED.has(s),
      );
      expect(
        offenders,
        `${fn} answers ${offenders.join(", ")} to an unauthenticated caller. ` +
          "Move the check above the reply: prove who is calling with requireAdmin, " +
          "then parse and validate. A body-dependent permission can still be " +
          "resolved afterwards by passing the context into requirePermission.",
      ).toEqual([]);
    });
  });
});
