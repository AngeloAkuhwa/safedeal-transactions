/**
 * An admin function must not answer a stranger.
 *
 * The 102 role-enforcement probes in `admin-auth.contract.test.ts` ask the live
 * backend a runtime question: does an anonymous caller get 401? This file asks
 * the structural one that runtime probing is bad at. Is there any path through
 * the handler that produces a *considered* response before the caller has been
 * identified at all?
 *
 * Three functions had one. `admin-export-enqueue` parsed the body first so it
 * would know which export type to gate on, and in doing so replied
 * `unsupported_export_type` to callers it had never authenticated. Sweep the
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
 *: which permits `await req.json().catch(() => ({}))` (parses early, answers
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
 * checks `is_internal_admin`. `admin-task-orchestration-action` has a scheduler
 * path that presents a shared secret in a header instead of a session. A
 * caller holding `CRON_SECRET` is identified, just not as a person.
 *
 * The secret clause requires a COMPARISON, not a read. Matching
 * `headers.get("x-anything-secret")` alone would mean one unused line —
 * `const _ = req.headers.get("x-secret")` at the top of a handler: exempts
 * that handler from this entire file, which is the shape anyone silencing a
 * failing test lands on first. `SUPABASE_SERVICE_ROLE_KEY` is likewise the
 * credential these functions use to reach the database, and says nothing about
 * who called them.
 */
const INLINE_AUTH =
  /auth\.getUser\(|is_internal_admin|has_any_internal_role|[\w.]*[Ss]ecret\w*\s*===\s*[\w.]+|[\w.]+\s*===\s*[\w.]*[Ss]ecret\w*/;

const AUTH_CALL = /\brequire(Admin|User|Permission|AnyPermission)\s*\(/;

/**
 * Comments are not code. A `// TODO: call requireAdmin here` above a pre-auth
 * 400 would otherwise close the window and exempt everything below it.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * The OPTIONS preflight answers before auth by design and carries no data.
 * Both the one-line and braced forms are in use here, and a correct preflight
 * may legitimately carry a 204: so the block is removed rather than its
 * status allowed, which would let a 204 through anywhere else too.
 */
const stripPreflight = (s: string) =>
  s
    .replace(/if\s*\(\s*req\.method\s*===\s*["']OPTIONS["']\s*\)\s*\{[\s\S]*?\n\s*\}/g, "\n")
    .replace(/if\s*\(\s*req\.method\s*===\s*["']OPTIONS["']\s*\)[^\n]*\n/g, "\n");

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
 * identified. Everything in this window runs for someone unknown.
 *
 * A `require*` that appears inside an arrow function is a definition, not a
 * call: `const gate = async () => requireAdmin(req)` at the top of a handler
 * would otherwise close the window while the real check happens much later.
 * Lines where `=>` precedes the match are skipped for that reason.
 */
function preAuthWindow(src: string): string | null {
  const serve = src.indexOf("Deno.serve(");
  if (serve === -1) return null;
  const body = src.slice(serve);

  const firstRealAuth = (re: RegExp): number => {
    for (const m of body.matchAll(new RegExp(re.source, re.flags + "g"))) {
      const i = m.index ?? -1;
      if (i < 0) continue;
      const lineStart = body.lastIndexOf("\n", i) + 1;
      if (body.slice(lineStart, i).includes("=>")) continue; // a definition
      return i;
    }
    return -1;
  };

  const candidates = [firstRealAuth(AUTH_CALL), firstRealAuth(INLINE_AUTH)].filter((i) => i >= 0);
  // No identification anywhere in the handler is itself the failure. Return
  // the whole body so the assertion below reports on it.
  if (!candidates.length) return body;
  return body.slice(0, Math.min(...candidates));
}

/**
 * Every `return` in the window, classified.
 *
 * The first version of this looked for `return json(..., 400)` and missed the
 * idiom used by the very function it was written for: `admin-transaction-actions`
 * emits all ~25 of its 400s through a local `badRequest()` helper, so moving
 * `return badRequest("missing_fields")` back above the auth check left the test
 * green. Helpers with a defaulted status (`json(body, status = 200)`) and
 * statuses held in constants slipped through the same gap.
 *
 * So the rule is inverted. Instead of hunting for statuses that are forbidden,
 * every `return <something>` in the window must be recognisably one of the
 * permitted refusals. Anything else. Any helper, any indirection, any status
 * this parser cannot read: is reported. That converts "I could not tell" from
 * a silent pass into a failure, which is the correct default for a file whose
 * entire job is to notice something absent.
 */
function unexplainedReturns(window: string): string[] {
  const out: string[] = [];
  const re = /\breturn\b([^;]*);/g;
  for (const m of window.matchAll(re)) {
    const expr = m[1].trim();

    // Bare `return;` and returns of an already-built auth refusal.
    if (!expr) continue;
    if (/^(resp|r|authResp|response)$/.test(expr)) continue;
    if (/authErrorResponse|corsPreflight/.test(expr)) continue;

    // An explicit refusal status is the only literal permitted here.
    const statuses = [...expr.matchAll(/\b([1-5]\d\d)\b/g)].map((s) => Number(s[1]));
    if (statuses.length && statuses.every((s) => ALLOWED.has(s))) continue;

    out.push(expr.replace(/\s+/g, " ").slice(0, 90));
  }
  return out;
}

/**
 * Statuses a handler may hand to someone it has not identified. Refusing a
 * method is a property of the URL rather than of the caller, and every one of
 * these handlers checks it in its first two lines, so 405 belongs here.
 */
const ALLOWED = new Set([401, 403, 405]);

describe("admin functions authenticate before they answer", () => {
  const fns = adminFunctions();

  it("finds the admin functions to check", () => {
    expect(fns.length).toBeGreaterThan(20);
  });

  describe.each(fns)("%s", (fn) => {
    const src = fs.readFileSync(path.join(FUNCTIONS, fn, "index.ts"), "utf8");

    const code = stripComments(src);

    it("identifies the caller somewhere in the handler", () => {
      const body = code.slice(code.indexOf("Deno.serve("));
      expect(
        AUTH_CALL.test(body) || INLINE_AUTH.test(body),
        `${fn} never resolves who is calling. Every other guarantee here rests on this one`,
      ).toBe(true);
    });

    it("returns nothing but 401/403/405 before the caller is known", () => {
      const window = preAuthWindow(code);
      expect(window, `${fn} has no Deno.serve handler`).not.toBeNull();
      const offenders = unexplainedReturns(stripPreflight(window!));
      expect(
        offenders,
        `${fn} replies to an unauthenticated caller:\n  ${offenders.join("\n  ")}\n` +
          "Move the check above the reply: prove who is calling with requireAdmin, " +
          "then parse and validate. A body-dependent permission can still be " +
          "resolved afterwards by passing that context into requirePermission.\n" +
          "If this return really is a refusal, give it a literal 401/403/405: " +
          "a status this parser cannot read is reported rather than assumed safe.",
      ).toEqual([]);
    });
  });
});
