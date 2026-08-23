/**
 * @vitest-environment node
 *
 * The product speaks to the merchant's outcome, not to its own revenue.
 *
 * The pricing hero used to read "Free forever, paid to grow. We only earn
 * when you get paid safely", and the same line echoed on the landing page
 * and the seller plan settings. The user's read as content strategist, and
 * the convention on the platforms studied for this pass (Shopify's pricing
 * leads audience-first and shows its own cut only as plain numbers in the
 * fee table; Payaza leads with the merchant's payment outcomes): a platform
 * discloses its fees as numbers, plainly, where fees are listed, and
 * everywhere else the copy leads with what the merchant gets.
 *
 * This is NOT a transparency reduction and must never become one: the fee
 * table's disclosure lines (pricing-copy.ts, "SafeDeal charges X per
 * completed deal, capped at Y") are the correct, load-bearing statement of
 * the platform's cut and this contract asserts they stay present. What the
 * blocklist removes is revenue-first *framing* in marketing copy: the
 * narrated "we earn when..." posture, not the facts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * The phrases that put the platform's revenue in the merchant's headline.
 * Small and specific on purpose: a broad net would start vetoing honest
 * sentences, and the point is posture, not censorship.
 */
const REVENUE_FIRST = [
  /we (only )?earn when/i,
  /we (only )?make money/i,
  /we take a (small )?cut/i,
  /paid to grow/i,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "admin") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("product voice", () => {
  it("no customer surface frames copy around the platform's revenue", () => {
    const offenders: string[] = [];
    for (const file of [...walk("src/pages"), ...walk("src/components"), ...walk("src/lib")]) {
      if (/pages\/Admin/.test(file)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const re of REVENUE_FIRST) {
        if (re.test(src)) offenders.push(`${file}: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the fee disclosure stays: posture never becomes opacity", () => {
    const copy = readFileSync("src/lib/pricing-copy.ts", "utf8");
    // The plain statement of the platform's cut, in the fee table, where a
    // fee belongs. If this disappears, the voice pass has been misread as
    // permission to hide the fee, and that is a louder failure.
    expect(copy).toMatch(/SafeDeal charges/);
    expect(copy).toMatch(/capped at/);
  });
});
