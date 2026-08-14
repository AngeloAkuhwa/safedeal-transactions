/**
 * PHASE 0d CONTRACT — the trust-claim lock.
 *
 * Every user-facing trust / protection claim string must live in
 * `src/lib/trust/trust-claims.ts`, where it is paired with the condition that
 * must hold for it to render. This test fails if any of those strings appears
 * as a literal anywhere under `src/pages/` or `src/components/`, so a new
 * screen physically cannot ship an ungated claim.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUST_CLAIMS, ALL_TRUST_CLAIM_TEXTS, isTrackedDelivery } from "@/lib/trust/trust-claims";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const SURFACES = [...walk(path.join(SRC, "pages")), ...walk(path.join(SRC, "components"))];
const rel = (f: string) => path.relative(SRC, f);

/** Retired claims that must never come back in any form. */
const RETIRED_CLAIMS = [
  "Verified Sellers",
  "All sellers undergo verification",
  "Real-time Tracking",
  "Delivery Support",
  "Protected Delivery",
  "Verified Seller Trust Profile",
];

describe("the trust-claim lock", () => {
  it("scans a meaningful number of files", () => {
    expect(SURFACES.length).toBeGreaterThan(100);
  });

  it("declares a condition and a basis for every claim", () => {
    for (const [key, c] of Object.entries(TRUST_CLAIMS)) {
      expect(c.text.length, key).toBeGreaterThan(0);
      expect(c.condition, key).toBeTruthy();
      expect(c.basis.length, key).toBeGreaterThan(10);
    }
  });

  for (const text of ALL_TRUST_CLAIM_TEXTS) {
    it(`"${text}" appears as a literal only in trust-claims.ts`, () => {
      const needle = new RegExp(`["'\`>]\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      const offenders = SURFACES.filter((f) => needle.test(fs.readFileSync(f, "utf8"))).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  for (const text of RETIRED_CLAIMS) {
    it(`the retired claim "${text}" is gone from the whole app`, () => {
      const offenders = SURFACES.filter((f) => fs.readFileSync(f, "utf8").includes(text)).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  it("treats handover methods as untracked and courier as tracked", () => {
    for (const m of ["hand_delivery", "meetup", "pickup", "digital"]) {
      expect(isTrackedDelivery(m), m).toBe(false);
    }
    for (const m of ["courier", "shipping", "standard_delivery"]) {
      expect(isTrackedDelivery(m), m).toBe(true);
    }
    expect(isTrackedDelivery(null)).toBe(false);
  });
});