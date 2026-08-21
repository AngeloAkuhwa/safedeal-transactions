/**
 * @vitest-environment node
 *
 * Node, not the suite's default jsdom: esbuild asserts
 * `new TextEncoder().encode("") instanceof Uint8Array` at startup, and jsdom's
 * TextEncoder builds its result in a different realm, so that invariant is
 * false and esbuild refuses to load. Nothing here touches the DOM.
 */

/**
 * Every edge function must actually parse.
 *
 * Nothing in CI reads these files as code. `tsc -p tsconfig.app.json` covers
 * `src/` and excludes `supabase/functions`; the suite either reads them as
 * *text* (`auth-precedes-answers` greps the pre-auth window) or talks to the
 * already-deployed copy over HTTP (`admin-auth.contract.test.ts`). A
 * `typecheck:edge` script exists in package.json, but it needs Deno and no job
 * runs it. So a syntactically broken handler passes every check we have and is
 * discovered at deploy, on the money path, by a user.
 *
 * This is not hypothetical. Merging `main` into a branch that had landed the
 * same auth-ordering fix produced a clean auto-merge. No conflict reported —
 * that contained the fix twice:
 *
 *     let baseCtx;
 *     try { baseCtx = await requireAdmin(req); } catch { ... }
 *     if (req.method !== "POST") return json(405, ...);
 *     let baseCtx;                                    // <- same scope
 *     try { baseCtx = await requireAdmin(req); } catch { ... }
 *
 * Git had no conflict to report because each side inserted the block at a
 * different offset, so both survived. `admin-flagged-users-action` would have
 * thrown `SyntaxError: Identifier 'baseCtx' has already been declared` at
 * module load: every request to it a 500. And typecheck, lint, the 1009-test
 * suite and the 102 live role-enforcement probes were all green on it, because
 * the probes were answered by the previous deploy.
 *
 * A parse is the cheapest possible check and it was the only one that could
 * have caught this, so it belongs here rather than in a workflow step: it runs
 * wherever the suite runs.
 *
 * esbuild rather than `ts.createSourceFile`, because the failure above is a
 * *binder* error, not a syntax error: TypeScript's standalone parser builds a
 * tree for it happily. esbuild does scope analysis during transform and
 * rejects the redeclaration, which is the class this guard exists for. It
 * arrives transitively with Vite (which cannot function without it), so this
 * costs no new dependency and no lockfile change.
 *
 * Scope note: this proves each file parses in isolation. It does not resolve
 * the `https://deno.land/...` imports or typecheck across them. That is what
 * `bun run typecheck:edge` does, and it still wants a Deno in CI.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FUNCTIONS = path.join(ROOT, "supabase/functions");

/** Every edge source: one `index.ts` per function, plus the shared modules. */
function edgeSources(): string[] {
  if (!fs.existsSync(FUNCTIONS)) return [];
  const out: string[] = [];

  for (const entry of fs.readdirSync(FUNCTIONS, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "_shared") continue;
    const file = path.join(FUNCTIONS, entry.name, "index.ts");
    if (fs.existsSync(file)) out.push(file);
  }

  const shared = path.join(FUNCTIONS, "_shared");
  if (fs.existsSync(shared)) {
    for (const entry of fs.readdirSync(shared, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) out.push(path.join(shared, entry.name));
    }
  }

  return out.sort();
}

describe("edge functions parse", () => {
  const sources = edgeSources();

  it("finds the edge sources to check", () => {
    // If this drops to zero the suite below vacuously passes, which is the
    // hollow-probe failure this repo has been bitten by before.
    expect(sources.length).toBeGreaterThan(20);
  });

  describe.each(sources.map((f) => [path.relative(ROOT, f), f] as const))("%s", (rel, file) => {
    it("parses as TypeScript", async () => {
      let transform: typeof import("esbuild").transform;
      try {
        ({ transform } = await import("esbuild"));
      } catch (err) {
        throw new Error(
          "esbuild could not be imported, so no edge function was checked. " +
            "It normally arrives with Vite. Refusing to report a pass for a " +
            `check that did not run. (${(err as Error).message})`,
        );
      }

      const src = fs.readFileSync(file, "utf8");
      await expect(
        transform(src, { loader: "ts", format: "esm", sourcefile: rel }),
        `${rel} does not parse: it would throw at module load and answer every ` +
          "request with a 500. A duplicated block from a clean auto-merge is the " +
          "usual cause; check for a declaration that appears twice in one scope.",
      ).resolves.toBeDefined();
    });
  });
});
