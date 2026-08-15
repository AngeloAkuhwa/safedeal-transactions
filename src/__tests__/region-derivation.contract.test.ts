/**
 * Region eligibility is derived, not stored.
 *
 * `is_user_region_allowed` used to read a boolean copied onto `profiles`. That
 * meant opening a new city left everyone already living there ineligible until
 * something re-ran the calculation over them — and the `buyer-profile` edge
 * function recomputing it on profile update gave the same fact two sources,
 * free to disagree.
 *
 * The decision this locks in: **the list of places we serve is
 * `serviceable_regions`, and authorization reads it directly.**
 * `profiles.is_region_eligible` survives as a display cache. If it ever becomes
 * load-bearing again, expansion silently breaks for existing users, so these
 * tests fail on that specific regression rather than on a general smell.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function sqlFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["supabase/migrations", "src/db/migrations"]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (f.endsWith(".sql")) out.push(path.join(abs, f));
  }
  return out.sort();
}

const stripComments = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** The last definition of a function wins — that is what the database runs. */
function latestBody(fn: string): { file: string; body: string } | null {
  let found: { file: string; body: string } | null = null;
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "gi",
  );
  for (const file of sqlFiles()) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const m of src.matchAll(re)) found = { file: path.relative(ROOT, file), body: m[1] };
  }
  return found;
}

describe("region eligibility is derived", () => {
  it("is_user_region_allowed does not read the stored flag", () => {
    const fn = latestBody("is_user_region_allowed");
    expect(fn, "is_user_region_allowed must exist").toBeTruthy();
    expect(
      /is_region_eligible/i.test(fn!.body),
      `${fn!.file} reads profiles.is_region_eligible — the gate must derive from serviceable_regions, ` +
        "or opening a new city leaves everyone already in it ineligible",
    ).toBe(false);
  });

  it("is_user_region_allowed derives from serviceable_regions", () => {
    const fn = latestBody("is_user_region_allowed")!;
    expect(
      /is_region_serviceable|serviceable_regions/i.test(fn.body),
      `${fn.file} must consult serviceable_regions`,
    ).toBe(true);
  });

  it("both region functions fail closed", () => {
    for (const name of ["is_user_region_allowed", "is_region_serviceable"]) {
      const fn = latestBody(name);
      expect(fn, `${name} must exist`).toBeTruthy();
      expect(
        /COALESCE|EXISTS/i.test(fn!.body),
        `${name} must resolve to false when nothing matches, never to NULL`,
      ).toBe(true);
    }
  });

  it("serviceability can be asked about an address, not only a user", () => {
    // Checkout must be able to ask about a delivery address the buyer just
    // typed, which has no profile row. Without this, the gate can only ever be
    // a property of the person.
    const fn = latestBody("is_region_serviceable");
    expect(fn, "is_region_serviceable(country, state, city) must exist").toBeTruthy();
  });
});
