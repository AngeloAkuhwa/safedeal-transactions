/**
 * Mirror lock for the admin label mappers.
 *
 * Both `src/lib/admin-mappers.ts` and `supabase/functions/_shared/admin-mappers.ts`
 * claim in their headers that this test guards the mirror. For fourteen rounds
 * it did not exist, and the edge copy silently drifted (it kept a
 * `currency = "NGN"` default the client had removed). This test makes the
 * claim true: the executable bodies must be byte-identical after normalising
 * comments, import extensions and whitespace.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const CLIENT = path.join(ROOT, "src/lib/admin-mappers.ts");
const EDGE = path.join(ROOT, "supabase/functions/_shared/admin-mappers.ts");

function normalise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/from\s+["']([^"']+?)\.ts["']/g, 'from "$1"')
    .replace(/\s+/g, " ")
    .trim();
}

describe("admin-mappers client/edge mirror", () => {
  it("both files exist", () => {
    expect(fs.existsSync(CLIENT)).toBe(true);
    expect(fs.existsSync(EDGE)).toBe(true);
  });

  it("the edge copy is a verbatim mirror of the client copy", () => {
    expect(normalise(fs.readFileSync(EDGE, "utf8"))).toEqual(
      normalise(fs.readFileSync(CLIENT, "utf8")),
    );
  });

  it("neither copy defaults a currency", () => {
    for (const f of [CLIENT, EDGE]) {
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/currency\s*(?::\s*string\s*)?=\s*["'`]/);
    }
  });
});
