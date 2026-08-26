/**
 * The error pipeline has to hold under the conditions it exists for.
 *
 * This is a guard written alongside the feature rather than after a defect,
 * because the defect it prevents is one nobody would ever see: an error
 * reporter that is broken reports nothing, and reporting nothing looks
 * exactly like nothing going wrong. Every other guard in this project can
 * fail loudly. This one cannot, so it gets checked structurally instead.
 *
 * Four properties, each with a way it would realistically be lost:
 *
 *   1. The reporter never throws. It is called from an error boundary and
 *      from `window.onerror`, which is to say only when the app is already
 *      broken. A reporter that throws there takes the page down while
 *      reporting that the page is down. The realistic regression is someone
 *      adding an `await` or a `JSON.parse` without a catch.
 *
 *   2. Fingerprints group. "Failed to load product 8f21" and the same
 *      message with a different id are one defect. Without normalisation the
 *      admin view becomes four thousand rows of the same thing and the
 *      second defect is invisible underneath. The realistic regression is
 *      someone adding a field to the basis that varies per occurrence.
 *
 *   3. Identity is never taken from the body. `log-error` is the only
 *      endpoint here that accepts writes from anyone at all, so a report
 *      claiming `user_id` must not be believed. The realistic regression is
 *      someone "fixing" anonymous reports by reading the field the client
 *      helpfully sends.
 *
 *   4. The table stays unreachable from a browser. Stacks name internal
 *      paths and `context` carries the shape of a failing request. The
 *      realistic regression is a later migration adding a convenience policy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fingerprintOf, reportError, installGlobalErrorHandlers } from "@/lib/errorLog";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const INGEST = "supabase/functions/log-error/index.ts";
const ADMIN_FN = "supabase/functions/admin-error-events/index.ts";
const MIGRATION = "supabase/migrations/20260826120000_error_events.sql";

describe("the reporter cannot make things worse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("swallows a fetch that rejects synchronously", () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("network stack is gone");
    });
    expect(() =>
      reportError({ kind: "test", message: "a message", severity: "error" }),
    ).not.toThrow();
  });

  it("swallows a message that is not a string", () => {
    expect(() =>
      reportError({ kind: "test", message: undefined as unknown as string }),
    ).not.toThrow();
  });

  it("swallows unserialisable context", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      reportError({ kind: "test", message: "circular", context: circular }),
    ).not.toThrow();
  });

  it("installs global handlers without throwing and is idempotent", () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow();
    expect(() => installGlobalErrorHandlers()).not.toThrow();
  });

  it("never awaits the network on the calling path", () => {
    // A reporter that returns a promise invites `await reportError(...)` in a
    // catch block, which is how a slow network turns into a frozen page.
    const returned = reportError({ kind: "test", message: "sync" });
    expect(returned).toBeUndefined();
  });
});

describe("fingerprints group a recurring defect into one row", () => {
  it("ignores ids that vary per occurrence", () => {
    const a = fingerprintOf("net", "Failed to load product 8f21b0c4", null);
    const b = fingerprintOf("net", "Failed to load product 4c09aa71", null);
    expect(a).toBe(b);
  });

  it("ignores uuids", () => {
    const a = fingerprintOf(
      "net",
      "No transaction 0f8fad5b-d9cb-469f-a165-70867728950e",
      null,
    );
    const b = fingerprintOf(
      "net",
      "No transaction 7c9e6679-7425-40de-944b-e07fc1f90ae7",
      null,
    );
    expect(a).toBe(b);
  });

  it("ignores short hex ids, which this project prints constantly", () => {
    // Found by this guard before the feature shipped: a hex reference is
    // neither a uuid nor a digit run, so it survived normalisation and every
    // product would have had its own row.
    expect(fingerprintOf("net", "Failed to load product 8f21b0c4", null)).toBe(
      fingerprintOf("net", "Failed to load product 4c09aa71", null),
    );
  });

  it("does not mistake ordinary words for hex ids", () => {
    // "facade" and "decade" are valid hex. A normaliser that ate them would
    // merge unrelated defects, which is the opposite failure and worse: it
    // hides one behind another rather than splitting one in two.
    expect(fingerprintOf("x", "the facade broke", null)).not.toBe(
      fingerprintOf("x", "the decade broke", null),
    );
  });

  it("keeps two different defects apart", () => {
    expect(fingerprintOf("net", "Timed out", null)).not.toBe(
      fingerprintOf("net", "Refused", null),
    );
  });

  it("keeps one generic message thrown from two places apart", () => {
    const a = fingerprintOf("x", "Cannot read properties of undefined", "  at Checkout (a.js:1)");
    const b = fingerprintOf("x", "Cannot read properties of undefined", "  at Payout (b.js:9)");
    expect(a).not.toBe(b);
  });

  it("marks its origin so a client hash never reads as an edge one", () => {
    // The edge half prefixes `e`. Two independent hashes colliding into one
    // group would merge a browser defect with a server one and send an
    // operator looking in the wrong system.
    expect(fingerprintOf("k", "m", null).startsWith("c")).toBe(true);
    expect(read("supabase/functions/_shared/log-error.ts")).toMatch(/return `e\$\{/);
  });

  it("normalises identically on both sides of the wire", () => {
    // The two halves cannot share code: one runs in Deno, one in the browser.
    // So the only thing keeping them from drifting is this comparison. Two
    // normalisers that disagree turn one defect into two groups, and the
    // divergence is invisible until someone is already reading the wrong one.
    const chain = (src: string) =>
      (src.match(/\.replace\([\s\S]*?\)\n/g) ?? [])
        .map((line) => line.replace(/\s+/g, " ").trim());
    const client = read("src/lib/errorLog.ts");
    const edge = read("supabase/functions/_shared/log-error.ts");
    const slice = (src: string) => {
      const at = src.indexOf("const normalised = message");
      const end = src.indexOf(".slice(0, 200)", at);
      return chain(src.slice(at, end));
    };
    expect(slice(edge)).toEqual(slice(client));
  });

  it("is stable across calls, which is the whole premise of grouping", () => {
    expect(fingerprintOf("k", "same message", "  at F (f.js:2)")).toBe(
      fingerprintOf("k", "same message", "  at F (f.js:2)"),
    );
  });
});

describe("ingest does not believe what it is told about identity", () => {
  const src = read(INGEST);

  it("never reads user_id from the request body", () => {
    expect(src).not.toMatch(/body\.user_id/);
    expect(src).not.toMatch(/body\[["']user_id["']\]/);
  });

  it("derives the caller from the bearer token instead", () => {
    expect(src).toMatch(/auth\.getUser\(/);
    expect(src).toMatch(/userId\s*=\s*data\?\.user\?\.id/);
  });

  it("measures the body before parsing it", () => {
    const textAt = src.indexOf("await req.text()");
    const parseAt = src.indexOf("JSON.parse(raw)");
    const guardAt = src.indexOf("raw.length > MAX_BODY_BYTES");
    expect(textAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(textAt);
    // JSON.parse on an unbounded string is the denial of service, so the
    // size check has to sit between the read and the parse.
    expect(parseAt).toBeGreaterThan(guardAt);
  });

  it("caps every free text field", () => {
    for (const cap of ["MAX_MESSAGE", "MAX_STACK", "MAX_CONTEXT_BYTES", "MAX_SHORT"]) {
      expect(src).toContain(cap);
    }
  });

  it("returns 200 rather than throwing when its own insert fails", () => {
    expect(src).toMatch(/return jsonResponse\(\{ ok: false \}, 200\)/);
  });

  it("takes the user agent from the header, not the body", () => {
    expect(src).toMatch(/req\.headers\.get\("user-agent"\)/);
    expect(src).not.toMatch(/body\.user_agent/);
  });
});

describe("the admin read path is gated and the table is not", () => {
  const adminSrc = read(ADMIN_FN);
  const sql = read(MIGRATION);

  it("requires a permission before it answers", () => {
    expect(adminSrc).toMatch(/requirePermission\(req, permission\)/);
    expect(adminSrc).toMatch(/platform_configuration\.view/);
  });

  it("requires a stronger permission to write than to read", () => {
    // Acknowledging mutates rows. Read access to the log must not carry it.
    expect(adminSrc).toMatch(
      /req\.method === "POST"\s*\?\s*"platform_configuration\.configure"/,
    );
  });

  it("enables RLS and grants no browser role anything", () => {
    expect(sql).toMatch(/ALTER TABLE public\.error_events ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.error_events FROM anon, authenticated/);
    // A policy here would make the table readable by the browsers that
    // produced the stacks in it.
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*error_events/i);
  });

  it("indexes the three questions an operator actually asks", () => {
    expect(sql).toMatch(/error_events_recent_idx/);
    expect(sql).toMatch(/error_events_fingerprint_idx/);
    expect(sql).toMatch(/error_events_correlation_idx/);
  });
});

describe("correlation survives the hop between browser and server", () => {
  it("the client sends the header the edge helper reads", () => {
    const shared = read("supabase/functions/_shared/log-error.ts");
    expect(shared).toMatch(/headers\.get\("x-correlation-id"\)/);
    // Every function that logs must also accept the header through CORS, or
    // the browser drops it in preflight and the two halves never join.
    expect(read(INGEST)).toContain("x-correlation-id");
    expect(read(ADMIN_FN)).toContain("x-correlation-id");
  });

  it("there is exactly one edge logger", () => {
    // A second logger beside a dead one is how this project ended up with
    // three: `_shared/log-error.ts` writing to a table nobody read, and
    // `admin-dashboard` with its own private copy of the same idea. The
    // consolidation only holds if nothing writes to the old store directly.
    const dir = path.join(ROOT, "supabase/functions");
    const modules: string[] = [];
    const directWriters: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/export (async )?function logEdgeError/.test(src)) {
          modules.push(path.relative(ROOT, full));
        }
        if (src.includes('from("edge_function_errors")')) {
          directWriters.push(path.relative(ROOT, full));
        }
      }
    };
    walk(dir);
    expect(modules).toEqual(["supabase/functions/_shared/log-error.ts"]);
    expect(directWriters, "the superseded store is written to directly").toEqual([]);
  });

  it("a function that logs a correlation id also accepts the header", () => {
    // The join is invisible when it breaks. A function that passes `req` to
    // the logger but does not list `x-correlation-id` in its CORS allow
    // headers has the header stripped at preflight, logs null, and the admin
    // view shows two unrelated rows. Nothing errors and nothing is reported:
    // the feature just quietly stops working.
    //
    // Scoped to functions that actually pass `req`. A function logging an
    // internal sub-query failure has no browser id to join to and is not
    // claiming otherwise, so demanding the header of it would be a check
    // that passes without meaning anything.
    const dir = path.join(ROOT, "supabase/functions");
    const claimants: string[] = [];
    const offenders: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (name === "_shared") continue; // the definition site is not a caller
      const file = path.join(dir, name, "index.ts");
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, "utf8");
      if (!/logEdgeError\([\s\S]{0,400}?\breq,/.test(src)) continue;
      claimants.push(name);
      if (!src.includes("x-correlation-id")) offenders.push(name);
    }
    // A guard that finds nothing to check has to say so rather than pass.
    expect(claimants.length, "no function passes req to the logger").toBeGreaterThan(0);
    expect(offenders, `these log a correlation id they will never receive: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("the money path carries the id from browser to server", () => {
    const client = read("src/services/payment-flow.service.ts");
    expect(client).toMatch(/"x-correlation-id": correlationId/);
    for (const fn of ["initiate-paystack-payment", "verify-paystack-payment"]) {
      expect(read(`supabase/functions/${fn}/index.ts`)).toContain("logEdgeError");
    }
  });

  it("never puts a share token in a row operators read", () => {
    // The token authorises payment on a public route. A log line carrying it
    // whole hands every holder of platform_configuration.view the ability to
    // pay on someone else's link.
    const client = read("src/services/payment-flow.service.ts");
    // Comments are not code. The comment above the redaction explains the
    // rule by naming the field, and a scan that reads prose would fail on the
    // very line that implements the fix.
    const code = client.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const reportBlocks = code.match(/reportError\(\{[\s\S]*?\n    \}\);/g) ?? [];
    expect(reportBlocks.length).toBeGreaterThan(0);
    for (const block of reportBlocks) {
      expect(block).not.toMatch(/shareToken(?!\.slice)/);
    }
  });

  it("the boundary shows the person the same id it reported", () => {
    const boundary = read("src/components/common/ErrorBoundary.tsx");
    expect(boundary).toMatch(/const reference = newId\(\)/);
    expect(boundary).toMatch(/correlationId: reference/);
    // Shown to the person, so "it broke, the code was c3f2a1" is enough for
    // an operator to find the exact stack.
    expect(boundary).toMatch(/reference\.slice\(0, 8\)/);
  });
});

describe("the app is actually wired to the pipeline", () => {
  // A reporter nobody calls is the same as no reporter, and the failure is
  // silent by construction.
  const app = read("src/App.tsx");
  const main = read("src/main.tsx");

  it("installs the global handlers at boot", () => {
    expect(main).toMatch(/installGlobalErrorHandlers\(\)/);
  });

  it("installs them before anything else that can fail", () => {
    const handlers = main.indexOf("installGlobalErrorHandlers()");
    const resilience = main.indexOf("installAuthTokenResilience()");
    expect(handlers).toBeGreaterThan(-1);
    if (resilience > -1) expect(handlers).toBeLessThan(resilience);
  });

  it("wraps the routes in a boundary", () => {
    expect(app).toMatch(/<ErrorBoundary/);
  });

  it("wraps the boundary around Suspense, not inside it", () => {
    // A lazy chunk that fails to load throws from Suspense's own subtree. A
    // boundary nested inside Suspense never sees it, and the buyer gets the
    // white page this whole feature exists to remove.
    const boundaryAt = app.indexOf("<ErrorBoundary");
    const suspenseAt = app.indexOf("<Suspense");
    expect(boundaryAt).toBeGreaterThan(-1);
    expect(suspenseAt).toBeGreaterThan(-1);
    expect(boundaryAt).toBeLessThan(suspenseAt);
  });
});
