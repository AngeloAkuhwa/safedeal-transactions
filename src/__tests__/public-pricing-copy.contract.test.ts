/**
 * Fee-figure literal lock.
 *
 * Fee rates, flat amounts and caps are CONFIGURATION (`pricing.*` rows in
 * `system_settings`), never copy. They have drifted across the landing page,
 * the pricing page and the edge-function helper copy. With one already wrong.
 * This test fails if any of those figures appears as a literal in a
 * user-facing file. Public surfaces must derive their wording from
 * `src/lib/pricing-copy.ts` (live config via the `public-pricing` function).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildPublicPricingCopy, FALLBACK_SACHETS } from "@/lib/pricing-copy";
import { FALLBACK_PRICING_CONFIG } from "@/lib/pricing";

const ROOT = path.resolve(__dirname, "../..");

/**
 * The only modules allowed to state a fee figure numerically: they DEFINE the
 * arithmetic (fallback config, provider rate cards, invariant thresholds).
 * Everything else must derive its wording from `pricing-copy.ts`.
 */
const DEFINITION_FILES = [
  "src/lib/pricing.ts",
  "src/lib/pricing-copy.ts",
  "src/lib/pricing-invariant.ts",
  "src/types/payment-flow.types.ts",
  "supabase/functions/_shared/pricing.ts",
  "supabase/functions/_shared/pricing-invariant.ts",
  "supabase/functions/_shared/sachet-catalog.ts",
];

/** Comments document the model; only shipped strings are copy. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(e.name) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(path.join(ROOT, "src/pages")),
  ...walk(path.join(ROOT, "src/components")),
  ...walk(path.join(ROOT, "src/lib")),
  ...walk(path.join(ROOT, "src/hooks")),
  ...walk(path.join(ROOT, "src/services")),
  ...walk(path.join(ROOT, "supabase/functions")),
].filter((f) => {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  return !DEFINITION_FILES.includes(rel);
});

/** Naira figures that are pricing configuration. */
const CONFIG_AMOUNTS = [
  FALLBACK_PRICING_CONFIG.platform_fee_flat,
  FALLBACK_PRICING_CONFIG.max_platform_fee,
  FALLBACK_PRICING_CONFIG.max_total_service_fee,
  2500, // retired Nigeria-MVP cap: must never reappear
  FALLBACK_SACHETS.photo_slots.amount_naira,
  FALLBACK_SACHETS.store_boost.amount_naira,
];

function nairaPatterns(n: number): RegExp[] {
  const grouped = n.toLocaleString("en-US");
  return [
    new RegExp(`₦\\s?${grouped.replace(/,/g, ",")}(?![\\d,])`),
    new RegExp(`₦\\s?${n}(?![\\d,])`),
    new RegExp(`NGN\\s?${grouped}(?![\\d,])`),
  ];
}

/** e.g. "2% +" / "2 % +": the rate stated as marketing copy. */
const RATE_LITERAL = new RegExp(
  `${(FALLBACK_PRICING_CONFIG.platform_fee_rate * 100).toFixed(0)}\\s?%\\s?\\+`,
);

describe("public pricing copy", () => {
  it("derives the headline, cap and disclosure from config", () => {
    const copy = buildPublicPricingCopy();
    expect(copy.safedealFeeHeadline).toBe("2% + ₦100");
    expect(copy.safedealFeeCap).toBe("₦5,000");
    expect(copy.totalServiceFeeCeiling).toBe("₦7,000");
    // The single-fee framing must disclose the processing fee charged on top.
    expect(copy.feeDisclosure).toMatch(/processing fee/i);
    expect(copy.feeDisclosure).toContain(copy.totalServiceFeeCeiling);
  });

  it("tracks an overridden platform config instead of the fallback", () => {
    const copy = buildPublicPricingCopy({
      platform_fee_rate: 0.03,
      platform_fee_flat: 200,
      max_platform_fee: 3000,
      max_total_service_fee: 4000,
    });
    expect(copy.safedealFeeHeadline).toBe("3% + ₦200");
    expect(copy.safedealFeeCap).toBe("₦3,000");
    expect(copy.perDealLine).toContain("₦3,000");
  });

  it("has no fee figure written as a literal in user-facing code", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const rel = path.relative(ROOT, file);
      for (const amount of CONFIG_AMOUNTS) {
        for (const re of nairaPatterns(amount)) {
          const m = src.match(re);
          if (m) offenders.push(`${rel}: ${m[0]}`);
        }
      }
      if (RATE_LITERAL.test(src)) offenders.push(`${rel}: rate literal "${src.match(RATE_LITERAL)![0]}"`);
    }
    expect(offenders).toEqual([]);
  });
});
