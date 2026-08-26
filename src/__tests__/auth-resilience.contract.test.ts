/**
 * Silence is not a verdict.
 *
 * The auth layer degraded twice in one week. On 2026-08-24 it flapped 504s on
 * `/auth/v1/token` for 11.5 hours; on 2026-08-25 calls took 42s, 2m20s and
 * 3m00s before failing. Postgres was healthy the whole time, so every session
 * token in every browser was still valid. Only the service that confirms them
 * was down.
 *
 * The app turned that into statements about people. An empty roles result read
 * as "you have no role" and sent an established seller to the role picker. A
 * 5xx from `getUser` read as "signed out" and changed the interface underneath
 * someone mid-checkout. Neither was something the server said.
 *
 * The rule this file enforces is one sentence: **an unanswered call must never
 * be rendered as a refusal.** It is checked from three directions, because the
 * failure can be reintroduced at any of them:
 *
 *   1. classification, where a status becomes a verdict;
 *   2. the retry helper, which must retry weather and never retry a refusal;
 *   3. the call sites, which must not navigate or sign anyone out on `unavailable`.
 *
 * The third is structural on purpose. A rendering test can assert what happens
 * for the states it thought to set up; only reading the source can assert that
 * no NEW branch was added that navigates on an inconclusive answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const reported: { kind: string; severity?: string }[] = [];
vi.mock("@/lib/errorLog", () => ({
  reportError: (r: { kind: string; severity?: string }) => reported.push(r),
  newId: () => "00000000-0000-4000-a000-000000000000",
}));

import {
  isDeniedError,
  resilientAuthCall,
  getAuthHealth,
  markAuthHealthy,
  __resetAuthHealth,
} from "@/lib/auth-resilience";

const ROOT = path.resolve(__dirname, "../..");
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Comments are not code, and this file's subjects are heavily commented
 * precisely because the distinction they encode is subtle. A scan that reads
 * prose fails on the comment explaining the rule while the code obeys it,
 * which is a guard reporting on itself.
 */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Fast settings: the real ones wait seconds on purpose. */
const FAST = { attempts: 3, timeoutMs: 200 };

beforeEach(() => {
  reported.length = 0;
  __resetAuthHealth();
});

describe("a status becomes a verdict only when it is one", () => {
  it.each([400, 401, 403])("%d is the service answering no", (status) => {
    expect(isDeniedError({ status, message: "no" })).toBe(true);
  });

  it.each([408, 429, 500, 502, 503, 504])("%d is the service not answering", (status) => {
    expect(isDeniedError({ status, message: "later" })).toBe(false);
  });

  it("reads a status nested under context, which is where supabase puts it", () => {
    expect(isDeniedError({ context: { status: 401 }, message: "no" })).toBe(true);
    expect(isDeniedError({ context: { status: 503 }, message: "later" })).toBe(false);
  });

  it("recognises GoTrue's own refusal codes", () => {
    expect(isDeniedError({ code: "invalid_grant", message: "bad refresh token" })).toBe(true);
    expect(isDeniedError({ code: "invalid_credentials", message: "bad password" })).toBe(true);
  });

  it("defaults an unrecognised failure to unavailable, not denied", () => {
    // The asymmetry is the reason. Retrying a genuine refusal wastes two
    // requests; refusing a genuine user locks them out of their own money.
    // A network error, an abort, a shape nobody anticipated: all weather.
    expect(isDeniedError(new Error("Failed to fetch"))).toBe(false);
    expect(isDeniedError({ message: "socket hang up" })).toBe(false);
    expect(isDeniedError({})).toBe(false);
    expect(isDeniedError(null)).toBe(false);
  });
});

describe("the retry helper retries weather and never a refusal", () => {
  it("succeeds on a later attempt after transient failures", async () => {
    let calls = 0;
    const outcome = await resilientAuthCall(
      "test.flaps",
      async () => {
        calls += 1;
        if (calls < 3) return { data: null, error: { status: 504, message: "gateway" } };
        return { data: { ok: true }, error: null };
      },
      FAST,
    );
    expect(calls).toBe(3);
    expect(outcome).toEqual({ kind: "ok", value: { ok: true } });
  });

  it("stops at the first refusal", async () => {
    let calls = 0;
    const outcome = await resilientAuthCall(
      "test.denied",
      async () => {
        calls += 1;
        return { data: null, error: { status: 400, message: "Invalid login credentials" } };
      },
      FAST,
    );
    // A login form that retried a typo three times would be slow for the
    // person and a credential-stuffing amplifier for everyone else.
    expect(calls).toBe(1);
    expect(outcome.kind).toBe("denied");
  });

  it("bounds a call that never comes back", async () => {
    // The incident's slowest observed call was three minutes. supabase-js has
    // no per-call timeout, so without this the caller waits as long as the
    // socket stays open.
    const started = Date.now();
    const outcome = await resilientAuthCall(
      "test.hangs",
      () => new Promise(() => {}),
      { attempts: 2, timeoutMs: 120 },
    );
    expect(outcome.kind).toBe("unavailable");
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("handles a call that throws as well as one that returns an error pair", async () => {
    // supabase-js does both depending on the method. Missing one is how a real
    // failure slips through as a success with empty data, which is the exact
    // defect this file exists to prevent.
    const thrown = await resilientAuthCall(
      "test.throws",
      async () => {
        throw Object.assign(new Error("boom"), { status: 500 });
      },
      FAST,
    );
    expect(thrown.kind).toBe("unavailable");

    const deniedThrow = await resilientAuthCall(
      "test.throws-denied",
      async () => {
        throw Object.assign(new Error("nope"), { status: 403 });
      },
      FAST,
    );
    expect(deniedThrow.kind).toBe("denied");
  });

  it("reports an exhausted call so the next incident is visible while it happens", async () => {
    await resilientAuthCall(
      "test.exhausts",
      async () => ({ data: null, error: { status: 503, message: "unavailable" } }),
      FAST,
    );
    const fatal = reported.filter((r) => r.kind === "auth_unavailable");
    expect(fatal.length).toBe(1);
    // Fatal because a signed-in person is about to be told something untrue
    // about their own account.
    expect(fatal[0].severity).toBe("fatal");
  });

  it("does not report a refusal, which is normal and not an incident", async () => {
    await resilientAuthCall(
      "test.denied",
      async () => ({ data: null, error: { status: 400, message: "bad password" } }),
      FAST,
    );
    expect(reported).toEqual([]);
  });

  it("moves the shared health belief and lets it be cleared", async () => {
    expect(getAuthHealth()).toBe("ok");
    await resilientAuthCall(
      "test.exhausts",
      async () => ({ data: null, error: { status: 502, message: "bad gateway" } }),
      FAST,
    );
    expect(getAuthHealth()).toBe("degraded");
    markAuthHealthy();
    expect(getAuthHealth()).toBe("ok");
  });
});

describe("no call site turns an unanswered call into a verdict", () => {
  const guard = read("src/components/auth/ProtectedRoute.tsx");

  it("the gate has a state for not knowing", () => {
    expect(guard).toContain('"unavailable"');
    expect(guard).toMatch(/<AuthUnavailable/);
  });

  it("every unavailable branch in the gate holds rather than navigates", () => {
    // The specific regression: `roles ?? []` reading as "no roles", then the
    // next branch sending an established seller to the role picker.
    //
    // Braces are matched rather than pattern-guessed. A lazy regex terminated
    // on the first closing brace at a guessed indentation, which silently ran
    // one branch past its own end and swept in the NEXT branch's navigation:
    // a scan that over-reaches fails on innocent code, and one that
    // under-reaches passes on guilty code. Neither is a check.
    const branches: string[] = [];
    const marker = 'kind === "unavailable") {';
    for (let i = guard.indexOf(marker); i !== -1; i = guard.indexOf(marker, i + 1)) {
      let depth = 0;
      let end = i + marker.length - 1;
      for (let j = i + marker.length - 1; j < guard.length; j++) {
        if (guard[j] === "{") depth++;
        else if (guard[j] === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      branches.push(guard.slice(i, end + 1));
    }
    // Three of them: the roles lookup, and the internal-role lookup on each
    // of its two paths. A guard that found none has to say so, not pass.
    expect(branches.length, "no unavailable branches found to check").toBe(3);
    for (const branch of branches) {
      expect(branch).toContain('setStatus("unavailable")');
      expect(branch).not.toMatch(/Navigate|navigate\(|setStatus\("(needs-role|unauthenticated|wrong-role)"\)/);
    }
  });

  it("the gate no longer discards the roles error", () => {
    // The original line was `const { data: roles } = await getUserRoles(...)`,
    // which drops `error` entirely and cannot tell empty from failed.
    expect(guard).not.toMatch(/const \{ data: roles \} = await getUserRoles/);
    expect(guard).toMatch(/resilientAuthCall\([\s\S]{0,80}getUserRoles/);
  });

  it("the session hook keeps its last good answer instead of guessing signed out", () => {
    const hook = read("src/hooks/useAuthState.ts");
    const branch = hook.match(/outcome\.kind === "unavailable"\)\s*\{[\s\S]*?\n {4}\}/)?.[0] ?? "";
    expect(branch, "no unavailable branch in useAuthState").not.toBe("");
    expect(branch).toContain("setIsAuthenticated(true)");
    expect(branch).not.toContain("signOut");
  });

  it("only a refusal clears the local session", () => {
    const hook = read("src/hooks/useAuthState.ts");
    const signOuts = hook.match(/^.*signOut.*$/gm) ?? [];
    expect(signOuts.length).toBe(1);
    const deniedBlock = hook.match(/outcome\.kind === "denied"\)\s*\{[\s\S]*?\n {4}\}/)?.[0] ?? "";
    expect(deniedBlock).toContain("signOut");
  });

  it("sign-in retries the service but not the password", () => {
    const service = read("src/services/auth.service.ts");
    expect(service).toMatch(/resilientAuthCall\([\s\S]{0,80}signInWithPassword/);
    // The message on an unreachable service must not accuse the credentials.
    expect(service).toMatch(/could not reach the sign-in service/i);
    expect(service).not.toMatch(/invalid email or password/i);
  });

  it("the unavailable screen does not claim the session ended", () => {
    const screen = read("src/components/auth/AuthUnavailable.tsx");
    // "Session expired" would be a lie that sends someone to reset a password
    // that works.
    expect(screen).not.toMatch(/session (has )?expired|sign in again|log in again/i);
    expect(screen).toMatch(/still signed in/i);
    // This screen can appear over a checkout, where the first question is
    // whether the money moved.
    expect(screen).toMatch(/escrow|unaffected/i);
  });
});
